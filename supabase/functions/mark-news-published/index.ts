import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");
    const { data: profile } = await client.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (!profile?.is_active || !["admin", "editor", "writer"].includes(profile.role)) throw new Error("Forbidden");
    const newsId = String((await req.json()).news_id || "");
    const { data: news, error: newsError } = await client.from("news_items").select("id,original_title,generated_title,clean_original_caption,original_caption,generated_caption,destination_page_id,status").eq("id", newsId).single();
    if (newsError || !news) throw new Error("Notícia não encontrada");
    if (news.status !== "published") {
      const { data: existing } = await client.from("publications").select("id").eq("news_item_id", news.id).is("archived_at", null).limit(1).maybeSingle();
      if (!existing) {
        const { error: publicationError } = await client.from("publications").insert({ news_item_id: news.id, title: news.original_title || news.generated_title || "Notícia", caption: news.clean_original_caption || news.original_caption || news.generated_caption || null, platform: "Publicação manual", page_id: news.destination_page_id || null, published_url: "", published_at: new Date().toISOString(), posted_by: user.id, source_type: "copy_news", created_by: user.id });
        if (publicationError && publicationError.code !== "23505") throw publicationError;
      }
      const { error: updateError } = await client.from("news_items").update({ status: "published" }).eq("id", news.id);
      if (updateError) throw updateError;
    }
    return json({ published: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400);
  }
});
