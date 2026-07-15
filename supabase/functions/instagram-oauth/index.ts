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
const metaVersion = () => Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";
const callbackUri = () => {
  const expected = "https://copynews.netlify.app/auth/instagram/callback";
  if (env("INSTAGRAM_REDIRECT_URI") !== expected)
    throw new Error("invalid_redirect_uri_configuration");
  return expected;
};
const encoder = new TextEncoder();

class OAuthStepError extends Error {
  reason: string;
  details: Record<string, unknown>;

  constructor(reason: string, details: Record<string, unknown> = {}) {
    super(reason);
    this.name = "OAuthStepError";
    this.reason = reason;
    this.details = details;
  }
}

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
  console.info(JSON.stringify({ event: "oauth_start_called" }));
  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Unauthorized" }, 401);
  const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  let pageId = String(body.page_id || "").trim();
  const admin = adminClient();
  const { data: profile } = await admin.from("profiles").select("is_active").eq("id", user.id).single();
  if (!profile?.is_active) return json({ error: "Forbidden" }, 403);
  if (!pageId) {
    const { data: activePages, error: pagesError } = await admin
      .from("pages")
      .select("id")
      .eq("is_active", true)
      .limit(2);
    if (pagesError) throw pagesError;
    if ((activePages || []).length === 1) pageId = activePages![0].id;
  }
  if (!pageId) return json({ error: "Selecione a página do Copy News" }, 400);
  const { data: page } = await admin.from("pages").select("id").eq("id", pageId).eq("is_active", true).single();
  if (!page) return json({ error: "Página do Copy News inválida" }, 400);
  const nonce = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const state = `${nonce}.${await hmac(nonce)}`;
  const now = new Date();
  await admin.from("oauth_states").delete().lt("expires_at", now.toISOString());
  const { error: insertError } = await admin.from("oauth_states").insert({
    state_hash: await digest(state),
    user_id: user.id,
    page_id: pageId,
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
  });
  if (insertError) throw insertError;
  const url = new URL(`https://www.facebook.com/${metaVersion()}/dialog/oauth`);
  url.searchParams.set("client_id", env("INSTAGRAM_APP_ID"));
  url.searchParams.set("redirect_uri", callbackUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    "instagram_basic,instagram_manage_insights,pages_read_engagement,pages_show_list",
  );
  console.info(JSON.stringify({ event: "oauth_url_created" }));
  return json({ authorization_url: url.toString() });
}

async function exchangeCode(code: string) {
  const shortUrl = new URL(`https://graph.facebook.com/${metaVersion()}/oauth/access_token`);
  shortUrl.searchParams.set("client_id", env("INSTAGRAM_APP_ID"));
  shortUrl.searchParams.set("client_secret", env("INSTAGRAM_APP_SECRET"));
  shortUrl.searchParams.set("redirect_uri", callbackUri());
  shortUrl.searchParams.set("code", code);
  const response = await fetch(shortUrl, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new OAuthStepError("code_exchange_failed", {
      provider: "meta",
      status: response.status,
      errorType: payload.error_type || payload.error?.type || null,
      errorCode: payload.code || payload.error?.code || null,
    });
  }
  const url = new URL(`https://graph.facebook.com/${metaVersion()}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", env("INSTAGRAM_APP_ID"));
  url.searchParams.set("client_secret", env("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("fb_exchange_token", payload.access_token);
  const longResponse = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const longPayload = await longResponse.json();
  if (!longResponse.ok || !longPayload.access_token) {
    throw new OAuthStepError("long_token_failed", {
      provider: "meta",
      status: longResponse.status,
      errorType: longPayload.error?.type || null,
      errorCode: longPayload.error?.code || null,
    });
  }
  return { accessToken: String(longPayload.access_token), expiresIn: Number(longPayload.expires_in || 0) };
}

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${metaVersion()}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new OAuthStepError("profile_failed", {
      provider: "meta",
      status: response.status,
      errorType: payload.error?.type || null,
      errorCode: payload.error?.code || null,
    });
  }
  return payload;
}

async function callback(body: Record<string, unknown>) {
  const state = String(body.state || "");
  const nonce = await verifyState(state);
  if (!nonce || !body.code)
    return json({ error: "Invalid state", reason: "invalid_state" }, 400);
  const admin = adminClient();
  const now = new Date().toISOString();
  const stateHash = await digest(state);
  const { data: oauthState } = await admin.from("oauth_states")
    .select("user_id,page_id")
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (!oauthState) return json({ error: "Invalid state", reason: "invalid_state" }, 400);
  const completedStages: string[] = [];
  const recordStage = (event: string) => {
    completedStages.push(event);
    console.info(JSON.stringify({ event }));
  };
  recordStage("state_validated");
  try {
  const token = await exchangeCode(String(body.code));
  recordStage("token_exchanged");
  const accountsPayload = await graph("me/accounts", token.accessToken, {
    fields: "id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
    limit: "100",
  });
  const managedPages = (accountsPayload.data || []).filter(
    (page: Record<string, unknown>) =>
      page.access_token &&
      (page.instagram_business_account as Record<string, unknown> | undefined)?.id,
  );
  const selectedPage = managedPages[0] as Record<string, unknown> | undefined;
  const instagram = selectedPage?.instagram_business_account as
    | { id?: string; username?: string; name?: string }
    | undefined;
  if (!selectedPage || !instagram?.id) throw new OAuthStepError("profile_missing_user_id");
  const providerAccountId = String(instagram.id);
  recordStage("profile_loaded");
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
    provider_page_id: String(selectedPage.id || ""),
    account_name: instagram.username ? `@${instagram.username}` : "Instagram profissional",
    encrypted_access_token: await encryptToken(
      String(selectedPage.access_token || token.accessToken),
      env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
    ),
    token_expires_at: token.expiresIn > 0 ? new Date(Date.now() + token.expiresIn * 1000).toISOString() : null,
    scopes: ["instagram_basic", "instagram_manage_insights", "pages_read_engagement", "pages_show_list"],
    status: "connected",
    history_window_days: 90,
    sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
  }, { onConflict: "provider,provider_account_id,user_id" }).select("id").single();
  if (accountError) throw accountError;
  recordStage("account_saved");
  const { data: usedState, error: usedStateError } = await admin.from("oauth_states")
    .update({ used_at: new Date().toISOString() })
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .select("state_hash")
    .maybeSingle();
  if (usedStateError || !usedState) throw usedStateError || new Error("state_already_used");
  await admin.from("audit_logs").insert({
    user_id: oauthState.user_id,
    action: "instagram.account.connected",
    entity_type: "connected_account",
    entity_id: account.id,
    metadata: { login: "instagram", callback: "netlify" },
  });
  recordStage("callback_completed");
  return json({
    redirect_url: redirectUrl({ instagram: "connected" }),
    completed_stages: completedStages,
  });
  } catch (error) {
    const reason = error instanceof OAuthStepError
      ? error.reason
      : error instanceof Error ? error.message : "connection_failed";
    console.error(JSON.stringify({
      event: "callback_failed",
      after: completedStages.at(-1) || "state_validated",
      reason,
      details: error instanceof OAuthStepError ? error.details : undefined,
    }));
    return json({
      error: "Instagram connection failed",
      reason,
      completed_stages: completedStages,
    }, 400);
  }
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
