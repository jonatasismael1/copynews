import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
const version = () => Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";

async function refreshInstagramToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error?.message || "Não foi possível renovar o acesso do Instagram",
    );
  }
  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 0),
  };
}

async function graph(
  path: string,
  token: string,
  params: Record<string, string> = {},
  instagramLogin = false,
) {
  const url = new URL(
    path.startsWith("http")
      ? path
      : `https://${instagramLogin ? "graph.instagram.com" : "graph.facebook.com"}/${version()}/${path.replace(/^\//, "")}`,
  );
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || payload.error)
    throw new Error(payload.error?.message || `Instagram API ${response.status}`);
  return payload;
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
    return {
      value: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function titleFromCaption(caption?: string | null) {
  const first = caption?.split(/\n+/).map((line) => line.trim()).find(Boolean);
  if (!first) return "Publicação do Instagram";
  return first.length > 140 ? `${first.slice(0, 137).trim()}...` : first;
}

async function caller(req: Request, admin: ReturnType<typeof createClient>) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === env("META_SYNC_CRON_SECRET"))
    return { userId: null, role: "admin", scheduled: true };
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active || !["admin", "editor", "writer"].includes(profile.role))
    throw new Error("Forbidden");
  return { userId: user.id, role: profile.role, scheduled: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const identity = await caller(req, admin);
    const body = await req.json().catch(() => ({}));
    let accountQuery = admin
      .from("connected_accounts")
      .select("*")
      .eq("provider", "instagram")
      .eq("status", "connected");
    if (body.account_id) accountQuery = accountQuery.eq("id", body.account_id);
    if (!identity.scheduled && identity.role !== "admin")
      accountQuery = accountQuery.eq("user_id", identity.userId);
    const { data: accounts, error: accountError } = await accountQuery;
    if (accountError) throw accountError;

    const summaries = [];
    for (const account of accounts || []) {
      if (!identity.scheduled && identity.role === "admin" && body.account_id &&
          account.user_id !== identity.userId && body.sync_all !== true) {
        throw new Error("Forbidden");
      }
      let token = await decryptToken(
        account.encrypted_access_token,
        env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
      );
      const instagramLogin = (account.scopes || []).includes(
        "instagram_business_basic",
      );
      const expiresAt = account.token_expires_at
        ? Date.parse(account.token_expires_at)
        : null;
      if (
        instagramLogin && expiresAt &&
        expiresAt - Date.now() < 7 * 86400000
      ) {
        try {
          const refreshed = await refreshInstagramToken(token);
          token = refreshed.accessToken;
          const encrypted = await encryptToken(
            token,
            env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
          );
          await admin.from("connected_accounts").update({
            encrypted_access_token: encrypted,
            token_expires_at: refreshed.expiresIn > 0
              ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
              : account.token_expires_at,
          }).eq("id", account.id);
        } catch (error) {
          if (expiresAt <= Date.now()) throw error;
        }
      }
      const initialFrom = account.last_sync_at
        ? new Date(Date.parse(account.last_sync_at) - 24 * 60 * 60 * 1000)
        : new Date(account.sync_from || Date.now() - 90 * 86400000);
      const since = String(Math.floor(initialFrom.getTime() / 1000));
      let next: string | null = `${account.provider_account_id}/media`;
      let params: Record<string, string> = {
        fields:
          "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count",
        since,
        limit: "100",
      };
      const media: Record<string, unknown>[] = [];
      for (let page = 0; next && page < 10; page += 1) {
        const payload = await graph(next, token, params, instagramLogin);
        media.push(...(payload.data || []));
        next = payload.paging?.next || null;
        params = {};
      }

      let imported = 0;
      let snapshots = 0;
      for (const item of media) {
        const mediaId = String(item.id);
        const row = {
          connected_account_id: account.id,
          external_media_id: mediaId,
          news_item_id: null,
          title: titleFromCaption(String(item.caption || "")),
          caption: item.caption ? String(item.caption) : null,
          platform: "Instagram",
          page_id: account.page_id,
          published_url: String(item.permalink),
          published_at: String(item.timestamp),
          posted_by: account.user_id,
          credit_text: item.username ? `@${item.username}` : account.account_name,
          source_type: "external",
          created_by: account.user_id,
          thumbnail_url: String(item.thumbnail_url || item.media_url || "") || null,
          metadata_provider: "meta-graph-api",
          metadata_fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: publication, error: publicationError } = await admin
          .from("publications")
          .upsert(row, { onConflict: "connected_account_id,external_media_id" })
          .select("id")
          .single();
        if (publicationError) throw publicationError;
        imported += 1;
        const metricNames = ["views", "reach", "shares", "saved", "reposts"];
        const entries = await Promise.all(
          metricNames.map(async (name) => [
            name,
            await insight(mediaId, name, token, instagramLogin),
          ] as const),
        );
        const metrics = Object.fromEntries(entries);
        const { error: metricError } = await admin.from("metric_snapshots").insert({
          publication_id: publication.id,
          captured_at: new Date().toISOString(),
          source: "api",
          views: metrics.views.value,
          reach: metrics.reach.value,
          impressions: 0,
          likes: Number(item.like_count || 0),
          comments: Number(item.comments_count || 0),
          shares: metrics.shares.value,
          saves: metrics.saved.value,
          reposts: metrics.reposts.value,
          clicks: 0,
          followers_gained: 0,
          raw_payload: { media: item, insights: metrics },
          created_by: account.user_id,
        });
        if (metricError) throw metricError;
        snapshots += 1;
      }
      await admin
        .from("connected_accounts")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", account.id);
      summaries.push({ account_id: account.id, imported, snapshots });
    }
    return json({ accounts: summaries, imported: summaries.reduce((sum, item) => sum + item.imported, 0) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
