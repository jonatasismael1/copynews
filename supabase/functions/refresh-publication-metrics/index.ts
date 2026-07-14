import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptToken } from "../_shared/token-crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function env(name: string) { const value = Deno.env.get(name); if (!value) throw new Error(`Missing environment variable: ${name}`); return value; }
const version = () => Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";

async function graph(
  path: string,
  token: string,
  params: Record<string, string> = {},
  instagramLogin = false,
) {
  const url = new URL(
    `https://${instagramLogin ? "graph.instagram.com" : "graph.facebook.com"}/${version()}/${path.replace(/^\//, "")}`,
  );
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || `Instagram API ${response.status}`);
  return payload;
}

function postKey(value: string) {
  try {
    const match = new URL(value).pathname.match(/\/(?:p|reel|reels|tv)\/([^/]+)/i);
    return match?.[1] || "";
  } catch { return ""; }
}

async function resolveMediaId(
  accountId: string,
  publicationUrl: string,
  token: string,
  instagramLogin: boolean,
) {
  let path = `${accountId}/media`;
  let params: Record<string, string> = { fields: "id,permalink,timestamp", limit: "100" };
  const expected = postKey(publicationUrl);
  for (let page = 0; page < 5; page += 1) {
    const payload = await graph(path, token, params, instagramLogin);
    const match = (payload.data || []).find((item: { permalink?: string }) =>
      expected && postKey(item.permalink || "") === expected
    );
    if (match?.id) return String(match.id);
    const next = payload.paging?.next;
    if (!next) break;
    const nextUrl = new URL(next);
    path = `${accountId}/media`;
    params = Object.fromEntries(nextUrl.searchParams.entries());
    delete params.access_token;
  }
  throw new Error("Publicação não encontrada entre as mídias recentes da conta conectada");
}

async function insight(
  mediaId: string,
  metric: string,
  token: string,
  instagramLogin: boolean,
) {
  try {
    const payload = await graph(
      `${mediaId}/insights`,
      token,
      { metric },
      instagramLogin,
    );
    const item = payload.data?.[0];
    const value = item?.values?.[0]?.value ?? item?.total_value?.value ?? item?.value;
    return { value: Number(value || 0), payload };
  } catch (error) {
    return { value: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new Error("Unauthorized");
    const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: profile } = await admin.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (!profile?.is_active || !["admin", "editor", "writer"].includes(profile.role)) throw new Error("Forbidden");
    const { publication_id: publicationId } = await req.json();
    const { data: publication, error: publicationError } = await admin.from("publications").select("id,page_id,connected_account_id,external_media_id,published_url,created_by,posted_by").eq("id", publicationId).is("archived_at", null).single();
    if (publicationError || !publication) throw new Error("Publicação não encontrada");
    if (profile.role === "writer" && publication.created_by !== user.id && publication.posted_by !== user.id) throw new Error("Forbidden");
    let accountQuery = admin.from("connected_accounts").select("*").eq("provider", "instagram").eq("status", "connected");
    accountQuery = publication.connected_account_id
      ? accountQuery.eq("id", publication.connected_account_id)
      : accountQuery
          .eq("page_id", publication.page_id || "00000000-0000-0000-0000-000000000000")
          .eq("user_id", publication.posted_by || publication.created_by);
    const { data: account } = await accountQuery.limit(1).maybeSingle();
    if (!account) throw new Error("Conecte a conta profissional do Instagram desta página nas Configurações");
    const token = await decryptToken(account.encrypted_access_token, env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"));
    const instagramLogin = (account.scopes || []).includes("instagram_business_basic");
    const mediaId = /^\d+$/.test(publication.external_media_id || "")
      ? publication.external_media_id
      : await resolveMediaId(account.provider_account_id, publication.published_url, token, instagramLogin);
    const basic = await graph(mediaId, token, { fields: "id,media_type,permalink,like_count,comments_count,timestamp" }, instagramLogin);
    const names = ["views", "reach", "shares", "saved", "reposts"];
    const entries = await Promise.all(names.map(async (name) => [name, await insight(mediaId, name, token, instagramLogin)] as const));
    const metrics = Object.fromEntries(entries);
    const snapshot = {
      publication_id: publication.id,
      captured_at: new Date().toISOString(),
      source: "api",
      views: metrics.views.value,
      reach: metrics.reach.value,
      impressions: 0,
      likes: Number(basic.like_count || 0),
      comments: Number(basic.comments_count || 0),
      shares: metrics.shares.value,
      saves: metrics.saved.value,
      reposts: metrics.reposts.value,
      clicks: 0,
      followers_gained: 0,
      raw_payload: { basic, insights: metrics },
      created_by: user.id,
    };
    const { data, error: insertError } = await admin.from("metric_snapshots").insert(snapshot).select().single();
    if (insertError) throw insertError;
    await Promise.all([
      admin.from("publications").update({ connected_account_id: account.id, external_media_id: mediaId }).eq("id", publication.id),
      admin.from("connected_accounts").update({ last_sync_at: new Date().toISOString() }).eq("id", account.id),
      admin.from("audit_logs").insert({ user_id: user.id, action: "publication.metrics.refreshed", entity_type: "publication", entity_id: publication.id }),
    ]);
    return json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400);
  }
});
