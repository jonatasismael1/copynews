import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "https://copynews.netlify.app",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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
const version = () => Deno.env.get("INSTAGRAM_GRAPH_API_VERSION") || "v25.0";
const encoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
async function digest(value: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env("TOKEN_ENCRYPTION_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}
async function verifyState(value: unknown) {
  const [nonce, signature, extra] = String(value || "").split(".");
  if (!nonce || !signature || extra) return null;
  const expected = fromBase64Url(await hmac(nonce));
  let supplied: Uint8Array;
  try { supplied = fromBase64Url(signature); } catch { return null; }
  if (supplied.length !== expected.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1)
    mismatch |= expected[index] ^ supplied[index];
  return mismatch === 0 ? nonce : null;
}
function redirectUrl(params: Record<string, string>) {
  const url = new URL("https://copynews.netlify.app/configuracoes");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
function adminClient() {
  return createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

async function start(req: Request, body: Record<string, unknown>) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  const pageId = String(body.page_id || "").trim();
  if (!pageId) return json({ error: "Selecione a página do Copy News" }, 400);
  const admin = adminClient();
  const [{ data: profile }, { data: page }] = await Promise.all([
    admin.from("profiles").select("is_active").eq("id", user.id).single(),
    admin.from("pages").select("id").eq("id", pageId).eq("is_active", true).single(),
  ]);
  if (!profile?.is_active) return json({ error: "Forbidden" }, 403);
  if (!page) return json({ error: "Página do Copy News inválida" }, 400);
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = `${nonce}.${await hmac(nonce)}`;
  const now = new Date();
  await admin.from("instagram_oauth_states").delete().lt("expires_at", now.toISOString());
  const { error: insertError } = await admin.from("instagram_oauth_states").insert({
    nonce_hash: await digest(nonce),
    user_id: user.id,
    page_id: pageId,
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
  });
  if (insertError) throw insertError;
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", env("INSTAGRAM_APP_ID"));
  url.searchParams.set("redirect_uri", env("INSTAGRAM_REDIRECT_URI"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_insights");
  url.searchParams.set("enable_fb_login", "0");
  url.searchParams.set("force_authentication", "1");
  return json({ authorization_url: url.toString() });
}

async function exchangeCode(code: string) {
  const form = new URLSearchParams({
    client_id: env("INSTAGRAM_APP_ID"),
    client_secret: env("INSTAGRAM_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: env("INSTAGRAM_REDIRECT_URI"),
    code,
  });
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error("code_exchange_failed");
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", payload.access_token);
  const longResponse = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const longPayload = await longResponse.json();
  if (!longResponse.ok || !longPayload.access_token) throw new Error("long_token_failed");
  return { accessToken: String(longPayload.access_token), expiresIn: Number(longPayload.expires_in || 0) };
}

async function callback(body: Record<string, unknown>) {
  if (body.error) return json({ redirect_url: redirectUrl({ instagram: "error", reason: "access_denied" }) });
  const nonce = await verifyState(body.state);
  if (!nonce || !body.code)
    return json({ error: "Invalid state", reason: "invalid_state" }, 400);
  const admin = adminClient();
  const now = new Date().toISOString();
  const { data: oauthState } = await admin.from("instagram_oauth_states")
    .update({ consumed_at: now })
    .eq("nonce_hash", await digest(nonce))
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("user_id,page_id")
    .maybeSingle();
  if (!oauthState) return json({ error: "Invalid state", reason: "invalid_state" }, 400);
  const token = await exchangeCode(String(body.code));
  const profileUrl = new URL(`https://graph.instagram.com/${version()}/me`);
  profileUrl.searchParams.set("fields", "user_id,username");
  profileUrl.searchParams.set("access_token", token.accessToken);
  const profileResponse = await fetch(profileUrl, { signal: AbortSignal.timeout(20_000) });
  const instagram = await profileResponse.json();
  if (!profileResponse.ok || instagram.error) throw new Error("profile_failed");
  const providerAccountId = String(instagram.user_id || "");
  if (!providerAccountId) throw new Error("profile_failed");
  const { error: disconnectError } = await admin.from("connected_accounts").update({
    status: "disconnected",
    encrypted_access_token: "disconnected",
    token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq("user_id", oauthState.user_id).eq("provider", "instagram").eq("status", "connected")
    .neq("provider_account_id", providerAccountId);
  if (disconnectError) throw disconnectError;
  const { data: account, error: accountError } = await admin.from("connected_accounts").upsert({
    user_id: oauthState.user_id,
    page_id: oauthState.page_id,
    provider: "instagram",
    provider_account_id: providerAccountId,
    provider_page_id: null,
    account_name: instagram.username ? `@${instagram.username}` : "Instagram profissional",
    encrypted_access_token: await encryptToken(token.accessToken, env("TOKEN_ENCRYPTION_KEY")),
    token_expires_at: token.expiresIn > 0 ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null,
    scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    status: "connected",
    history_window_days: 90,
    sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
  }, { onConflict: "provider,provider_account_id,user_id" }).select("id").single();
  if (accountError) throw accountError;
  await admin.from("audit_logs").insert({
    user_id: oauthState.user_id,
    action: "instagram.account.connected",
    entity_type: "connected_account",
    entity_id: account.id,
    metadata: { login: "instagram", callback: "netlify" },
  });
  return json({ redirect_url: redirectUrl({ instagram: "connected", account_id: account.id }) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json();
    if (body.action === "start") return await start(req, body);
    if (body.action === "callback") return await callback(body);
    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "connection_failed";
    console.error(JSON.stringify({ event: "instagram_oauth_failed", reason }));
    return json({ error: "Instagram connection failed", reason: "connection_failed" }, 400);
  }
});
