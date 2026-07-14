import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function actor(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await client
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) throw new Error("Unauthorized");
  if (profile.role === "viewer") throw new Error("Forbidden");
  return { user, profile };
}

const adminClient = () =>
  createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

async function removeRows(
  admin: ReturnType<typeof adminClient>,
  rows: { id: string; temporary_media_path: string | null }[],
) {
  if (!rows.length) return { deleted: 0, media_cleanup_pending: false };
  const ids = rows.map((row) => row.id);
  const paths = rows
    .map((row) => row.temporary_media_path)
    .filter((path): path is string => Boolean(path));
  const { error } = await admin.from("news_items").delete().in("id", ids);
  if (error) throw error;
  let mediaCleanupPending = false;
  if (paths.length) {
    const { error: storageError } = await admin.storage
      .from("temporary-media")
      .remove(paths);
    if (storageError) {
      mediaCleanupPending = true;
      console.error(
        JSON.stringify({ event: "news.media_cleanup_failed", paths, storageError }),
      );
    }
  }
  return { deleted: rows.length, media_cleanup_pending: mediaCleanupPending };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user, profile } = await actor(req);
    const body = await req.json();
    const admin = adminClient();
    let result = { deleted: 0, media_cleanup_pending: false };

    if (body.action === "delete" || body.action === "archive") {
      if (typeof body.news_id !== "string") throw new Error("Notícia ausente");
      const { data, error } = await admin
        .from("news_items")
        .select("id,temporary_media_path,created_by,assigned_to")
        .eq("id", body.news_id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Notícia não encontrada");
      const canManage =
        profile.role === "admin" ||
        profile.role === "editor" ||
        data.created_by === user.id ||
        data.assigned_to === user.id;
      if (!canManage) throw new Error("Forbidden");
      if (body.action === "archive") {
        const { error: archiveError } = await admin
          .from("news_items")
          .update({ archived_at: new Date().toISOString(), status: "archived" })
          .eq("id", data.id);
        if (archiveError) throw archiveError;
        result = { deleted: 0, media_cleanup_pending: false };
      } else {
        result = await removeRows(admin, [data]);
      }
    } else if (body.action === "delete_all") {
      if (profile.role !== "admin") throw new Error("Forbidden");
      if (body.confirmation !== "EXCLUIR")
        throw new Error("Confirmação inválida");
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await admin
          .from("news_items")
          .select("id,temporary_media_path")
          .limit(200);
        if (error) throw error;
        const batch = await removeRows(admin, data || []);
        result.deleted += batch.deleted;
        result.media_cleanup_pending ||= batch.media_cleanup_pending;
        hasMore = Boolean(data?.length);
      }
    } else {
      throw new Error("Ação inválida");
    }

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action:
        body.action === "delete_all"
          ? "news.deleted_all"
          : body.action === "archive"
            ? "news.archived"
            : "news.deleted",
      entity_type: "news_item",
      entity_id: body.action === "delete" ? body.news_id : null,
      after_data: result,
    });
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    console.error(JSON.stringify({ message, status }));
    return json({ error: message }, status);
  }
});
