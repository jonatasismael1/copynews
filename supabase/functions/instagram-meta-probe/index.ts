import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };
const version = () => Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";

async function request(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.instagram.com/${version()}/${path.replace(/^\//, "")}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`${payload.error?.code || response.status}:${payload.error?.message || "Meta error"}`);
  return payload;
}

async function refresh(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const payload = await response.json();
  return response.ok && payload.access_token
    ? { token: String(payload.access_token), expiresIn: Number(payload.expires_in || 0), refreshed: true }
    : { token, expiresIn: 0, refreshed: false };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("x-probe-secret") !== env("META_PROBE_SECRET")) return json({ error: "Unauthorized" }, 401);
  try {
    const refreshed = await refresh(env("META_ACCESS_TOKEN"));
    const token = refreshed.token;
    const profile = await request("me", token, { fields: "id,user_id,username,name,profile_picture_url,followers_count,media_count" });
    const mediaPayload = await request(`${profile.user_id || profile.id}/media`, token, { fields: "id,permalink,caption,timestamp,media_type,media_product_type,thumbnail_url,media_url,like_count,comments_count", limit: "5" });
    const media = mediaPayload.data || [];
    const availableFields = [...new Set(media.flatMap((item: Record<string, unknown>) => Object.keys(item)))].sort();
    const mediaTypes = media.reduce((counts: Record<string, number>, item: Record<string, unknown>) => {
      const key = String(item.media_product_type || item.media_type || "unknown");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
    const insightMetrics: Record<string, boolean> = {};
    if (media[0]?.id) {
      for (const metric of ["views", "plays", "reach", "impressions", "shares", "saved"]) {
        try { await request(`${media[0].id}/insights`, token, { metric }); insightMetrics[metric] = true; }
        catch { insightMetrics[metric] = false; }
      }
    }
    let collaboratorsAvailable = false;
    if (media[0]?.id) {
      try { await request(String(media[0].id), token, { fields: "collaborators" }); collaboratorsAvailable = true; } catch { /* unsupported */ }
    }
    const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: owner } = await admin.from("profiles").select("id").eq("role", "admin").eq("is_active", true).order("created_at").limit(1).single();
    const { data: page } = await admin.from("pages").select("id").eq("is_active", true).order("created_at").limit(1).single();
    if (!owner || !page) throw new Error("Copy News admin/page missing");
    const expiresAt = refreshed.expiresIn > 0 ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString() : null;
    const { data: account, error } = await admin.from("connected_accounts").upsert({
      user_id: owner.id, page_id: page.id, provider: "instagram", provider_account_id: String(profile.user_id || profile.id),
      provider_page_id: null, username: profile.username || null, account_name: profile.username ? `@${profile.username}` : "Instagram profissional",
      profile_picture_url: profile.profile_picture_url || null, encrypted_access_token: await encryptToken(token, env("CONNECTED_ACCOUNT_ENCRYPTION_KEY")),
      token_expires_at: expiresAt, last_refresh_at: new Date().toISOString(), refresh_error: null, needs_attention: false,
      scopes: ["instagram_business_basic", "instagram_business_manage_insights"], status: "connected", data_source: collaboratorsAvailable ? "meta" : "meta+apify",
      history_window_days: 90, sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
    }, { onConflict: "provider,provider_account_id,user_id" }).select("id").single();
    if (error) throw error;
    const syncResponse = await fetch(`${env("SUPABASE_URL")}/functions/v1/sync-instagram-publications`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": env("META_SYNC_CRON_SECRET") },
      body: JSON.stringify({ action: "probe", account_id: account.id }),
      signal: AbortSignal.timeout(120_000),
    });
    const syncPayload = await syncResponse.json().catch(() => ({}));
    return json({ ok: true, account_id: account.id, profile: { id: String(profile.user_id || profile.id), username: profile.username || null, media_count: profile.media_count ?? null, fields: Object.keys(profile).sort() }, long_lived: refreshed.refreshed, expires_at: expiresAt, media_tested: media.length, media_types: mediaTypes, media_fields: availableFields, insights: insightMetrics, collaborators_available: collaboratorsAvailable, apify_needed_for_collabs: !collaboratorsAvailable, sync: { ok: syncResponse.ok, imported: Number(syncPayload.imported || 0), error: syncResponse.ok ? null : String(syncPayload.error || "sync_failed").slice(0, 240) } });
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/IGA[A-Za-z0-9_-]+/g, "[token]").slice(0, 300) : "Probe failed";
    return json({ ok: false, error: message }, 400);
  }
});
