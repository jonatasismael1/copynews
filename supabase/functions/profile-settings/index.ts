import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
function canvaUrl(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const url = new URL(text);
  if (
    url.protocol !== "https:" ||
    !/(^|\.)(canva\.com|canva\.link)$/i.test(url.hostname)
  )
    throw new Error("Use um link HTTPS do Canva ou canva.link");
  return url.toString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new Error("Unauthorized");
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .single();
    if (!profile?.is_active) throw new Error("Forbidden");
    const body = await req.json();
    const values = {
      canva_video_url: canvaUrl(body.canva_video_url),
      canva_image_url: canvaUrl(body.canva_image_url),
    };
    const { data, error: updateError } = await admin
      .from("profiles")
      .update(values)
      .eq("id", user.id)
      .select("canva_video_url,canva_image_url")
      .single();
    if (updateError) throw updateError;
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "profile.editor_links.updated",
      entity_type: "profile",
      entity_id: user.id,
    });
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
