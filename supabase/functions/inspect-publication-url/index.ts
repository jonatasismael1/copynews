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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
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
    if (
      !profile?.is_active ||
      !["admin", "editor", "writer"].includes(profile.role)
    )
      throw new Error("Forbidden");
    const body = await req.json();
    return json(await inspectPublicationUrl(String(body.published_url || "")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return json({ error: message }, status);
  }
});
