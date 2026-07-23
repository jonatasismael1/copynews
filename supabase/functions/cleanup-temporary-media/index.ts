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
function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      const status =
        message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
      console.error(JSON.stringify({ message, status }));
      return json({ error: message }, status);
    }
  };
}
Deno.serve(
  handler(async (req) => {
    if (req.headers.get("x-cron-secret") !== env("CRON_SECRET"))
      throw new Error("Unauthorized");
    const admin = adminClient();
    const { data: expired, error } = await admin
      .from("news_items")
      .select("id,temporary_media_path,temporary_media_paths")
      .not("temporary_media_path", "is", null)
      .lt("temporary_media_expires_at", new Date().toISOString())
      .limit(100);
    if (error) throw error;
    const paths = [
      ...new Set(
        (expired || []).flatMap((item) =>
          item.temporary_media_paths?.length
            ? item.temporary_media_paths
            : [item.temporary_media_path].filter(Boolean),
        ),
      ),
    ];
    if (paths.length) {
      const { error: storageError } = await admin.storage
        .from("temporary-media")
        .remove(paths);
      if (storageError) throw storageError;
      const { error: updateError } = await admin
        .from("news_items")
        .update({
          temporary_media_path: null,
          temporary_media_paths: [],
          temporary_media_expires_at: null,
        })
        .in(
          "id",
          expired!.map((x) => x.id),
        );
      if (updateError) throw updateError;
    }
    return json({ removed: paths.length });
  }),
);
