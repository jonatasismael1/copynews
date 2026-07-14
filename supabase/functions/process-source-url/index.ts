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
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active) throw new Error("Unauthorized");
  return { client, user, profile };
}

function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const status =
        message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
      console.error(JSON.stringify({ message, status }));
      return json({ error: message }, status);
    }
  };
}

const supported = new Set(["http:", "https:"]);
function platform(host: string) {
  if (host.includes("instagram")) return "instagram";
  if (host.includes("tiktok")) return "tiktok";
  if (host.includes("youtu")) return "youtube";
  if (host.includes("facebook") || host.includes("fb.")) return "facebook";
  return "web";
}

Deno.serve(
  handler(async (req) => {
    const { client, user, profile } = await context(req);
    if (!["admin", "editor", "writer"].includes(profile.role))
      throw new Error("Forbidden");
    const body = await req.json();
    const url = new URL(String(body.source_url));
    if (
      !supported.has(url.protocol) ||
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
      url.hostname.endsWith(".local")
    )
      throw new Error("URL inválida");

    const { data: duplicate } = await client
      .from("news_items")
      .select("id")
      .eq("source_url", url.toString())
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    const { data: news, error } = await client
      .from("news_items")
      .insert({
        source_url: url.toString(),
        source_platform: platform(url.hostname),
        assigned_to: user.id,
        category_id: body.category_id || null,
        destination_page_id: body.destination_page_id || null,
        created_by: user.id,
        status: "processing",
      })
      .select("id")
      .single();
    if (error) throw error;
    const { data: job, error: jobError } = await client
      .from("processing_jobs")
      .insert({
        news_item_id: news.id,
        current_step: "validate_url",
        status: "queued",
        progress: 0,
        step_results: {
          editorial_tone: body.editorial_tone || "Jornalístico, claro e direto",
          notes: body.notes || null,
        },
      })
      .select("id")
      .single();
    if (jobError) throw jobError;
    return json(
      {
        news_item_id: news.id,
        job_id: job.id,
        duplicate_of: duplicate?.id || null,
      },
      202,
    );
  }),
);
