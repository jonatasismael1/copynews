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
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();
  if (!profile) throw new Error("Inactive user");
  return { client };
}
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
    const { client } = await context(req);
    const { news_item_id } = await req.json();
    const { data: news, error } = await client
      .from("news_items")
      .select(
        "temporary_media_path,temporary_media_paths,temporary_media_expires_at",
      )
      .eq("id", news_item_id)
      .single();
    const paths = news?.temporary_media_paths?.length
      ? news.temporary_media_paths
      : news?.temporary_media_path
        ? [news.temporary_media_path]
        : [];
    if (error || !paths.length) throw new Error("Mídia indisponível");
    if (
      news.temporary_media_expires_at &&
      new Date(news.temporary_media_expires_at) < new Date()
    )
      throw new Error("Mídia expirada");
    const seconds = Math.min(
      900,
      Math.max(
        60,
        Math.floor(
          (new Date(news.temporary_media_expires_at).getTime() - Date.now()) /
            1000,
        ),
      ),
    );
    const { data, error: signError } = await client.storage
      .from("temporary-media")
      .createSignedUrls(paths, seconds, { download: true });
    if (signError) throw signError;
    const urls = (data || [])
      .filter((item) => item.signedUrl)
      .map((item, index) => ({
        url: item.signedUrl,
        path: paths[index],
        index,
      }));
    if (!urls.length) throw new Error("Mídia indisponível");
    return json({ url: urls[0].url, urls, expires_in: seconds });
  }),
);
