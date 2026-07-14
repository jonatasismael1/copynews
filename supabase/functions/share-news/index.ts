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
function slugify(value: string) {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "noticia";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 7);
  return `${base}-${suffix}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const body = await req.json();
    if (body.action === "read") {
      const slug = String(body.slug || "").trim();
      const { data: news, error } = await admin
        .from("news_items")
        .select(
          "id,public_slug,source_url,source_platform,source_author,source_caption,temporary_media_path,transcript,ocr_text,generated_title,generated_caption,summary,ai_confidence,ai_warnings,detected_facts,created_at,publications(platform,published_url,published_at)",
        )
        .eq("public_slug", slug)
        .eq("share_enabled", true)
        .single();
      if (error || !news) throw new Error("Link compartilhado não encontrado");
      let downloadUrl = null;
      if (news.temporary_media_path) {
        const { data } = await admin.storage
          .from("temporary-media")
          .createSignedUrl(news.temporary_media_path, 3600, { download: true });
        downloadUrl = data?.signedUrl || null;
      }
      return json({ ...news, download_url: downloadUrl });
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");
    const { data: profile } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();
    if (!profile?.is_active || !["admin", "editor", "writer"].includes(profile.role))
      throw new Error("Forbidden");
    const { data: current, error: readError } = await admin
      .from("news_items")
      .select("id,created_by,assigned_to,generated_title,public_slug")
      .eq("id", body.news_id)
      .single();
    if (readError || !current) throw new Error("Notícia não encontrada");
    if (
      profile.role === "writer" &&
      current.created_by !== user.id &&
      current.assigned_to !== user.id
    ) throw new Error("Forbidden");

    if (body.action === "disable") {
      await admin
        .from("news_items")
        .update({ share_enabled: false })
        .eq("id", current.id);
      return json({ disabled: true });
    }
    if (body.action !== "enable") throw new Error("Ação inválida");
    const slug = current.public_slug || slugify(current.generated_title || "noticia");
    const { data: updated, error: updateError } = await admin
      .from("news_items")
      .update({
        public_slug: slug,
        share_enabled: true,
        shared_at: new Date().toISOString(),
        temporary_media_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      })
      .eq("id", current.id)
      .select("public_slug")
      .single();
    if (updateError) throw updateError;
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "news.shared",
      entity_type: "news_item",
      entity_id: current.id,
    });
    return json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
