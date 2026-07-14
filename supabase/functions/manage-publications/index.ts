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
const adminClient = () =>
  createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { user, profile } = await actor(req);
    const body = await req.json();
    if (!['archive', 'delete'].includes(body.action))
      throw new Error("Ação inválida");
    if (typeof body.publication_id !== "string")
      throw new Error("Publicação ausente");
    const admin = adminClient();
    const { data: publication, error } = await admin
      .from("publications")
      .select("id,created_by,posted_by")
      .eq("id", body.publication_id)
      .maybeSingle();
    if (error) throw error;
    if (!publication) throw new Error("Publicação não encontrada");
    const canManage =
      profile.role === "admin" ||
      profile.role === "editor" ||
      publication.created_by === user.id ||
      publication.posted_by === user.id;
    if (!canManage) throw new Error("Forbidden");

    if (body.action === "archive") {
      const { error: archiveError } = await admin
        .from("publications")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", publication.id);
      if (archiveError) throw archiveError;
    } else {
      const { error: deleteError } = await admin
        .from("publications")
        .delete()
        .eq("id", publication.id);
      if (deleteError) throw deleteError;
    }
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action:
        body.action === "archive" ? "publication.archived" : "publication.deleted",
      entity_type: "publication",
      entity_id: publication.id,
    });
    return json({ ok: true, action: body.action });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    console.error(JSON.stringify({ message, status }));
    return json({ error: message }, status);
  }
});
