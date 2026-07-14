import { createClient } from "jsr:@supabase/supabase-js@2";
import { inspectPublicationUrl } from "../_shared/publication-metadata.ts";

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

async function context(req: Request) {
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
  return { client, user, profile };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { client, user, profile } = await context(req);
    if (!["admin", "editor", "writer"].includes(profile.role))
      throw new Error("Forbidden");
    const body = await req.json();
    const publishedUrl = String(body.published_url || "").trim();
    if (!publishedUrl) throw new Error("Informe o link da publicação");
    const metadata = await inspectPublicationUrl(publishedUrl);
    const { data, error } = await client
      .from("publications")
      .insert({
        news_item_id: body.news_item_id || null,
        title: metadata.title,
        caption: metadata.caption,
        platform: metadata.platform,
        page_id: body.page_id || null,
        published_url: new URL(publishedUrl).toString(),
        published_at: metadata.published_at,
        posted_by: user.id,
        credit_text: metadata.author,
        source_type: body.news_item_id ? "copy_news" : "external",
        created_by: user.id,
        external_media_id: metadata.external_media_id,
        thumbnail_url: metadata.thumbnail_url,
        metadata_provider: metadata.provider,
        metadata_fetched_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return json(data, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    console.error(JSON.stringify({ message, status }));
    return json({ error: message }, status);
  }
});
