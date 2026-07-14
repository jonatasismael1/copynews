import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function graph(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${version()}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || "A Meta recusou a solicitação");
  }
  return payload;
}

async function instagramGraph(
  path: string,
  token: string,
  params: Record<string, string> = {},
) {
  const url = new URL(
    `https://graph.instagram.com/${version()}/${path.replace(/^\//, "")}`,
  );
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value)
  );
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(
      payload.error?.message || "O Instagram recusou a solicitação",
    );
  }
  return payload;
}

function validRedirect(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!local && url.origin !== "https://copynews.netlify.app") || url.pathname !== "/configuracoes") {
    throw new Error("Redirect OAuth não autorizado");
  }
  return url.toString();
}

async function exchangeCode(code: string, redirectUri: string) {
  const url = new URL(`https://graph.facebook.com/${version()}/oauth/access_token`);
  url.searchParams.set("client_id", env("META_APP_ID"));
  url.searchParams.set("client_secret", env("META_APP_SECRET"));
  url.searchParams.set("redirect_uri", validRedirect(redirectUri));
  url.searchParams.set("code", code);
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message || "Não foi possível concluir o login da Meta");
  }
  const longUrl = new URL(`https://graph.facebook.com/${version()}/oauth/access_token`);
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", env("META_APP_ID"));
  longUrl.searchParams.set("client_secret", env("META_APP_SECRET"));
  longUrl.searchParams.set("fb_exchange_token", payload.access_token);
  const longResponse = await fetch(longUrl, { signal: AbortSignal.timeout(20000) });
  const longPayload = await longResponse.json();
  return longResponse.ok && longPayload.access_token ? longPayload.access_token : payload.access_token;
}

async function exchangeInstagramCode(code: string, redirectUri: string) {
  const form = new URLSearchParams({
    client_id: env("META_APP_ID"),
    client_secret: env("META_APP_SECRET"),
    grant_type: "authorization_code",
    redirect_uri: validRedirect(redirectUri),
    code,
  });
  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_message || payload.error?.message ||
        "Não foi possível concluir o login do Instagram",
    );
  }

  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", env("META_APP_SECRET"));
  longUrl.searchParams.set("access_token", payload.access_token);
  const longResponse = await fetch(longUrl, {
    signal: AbortSignal.timeout(20_000),
  });
  const longPayload = await longResponse.json();
  return longResponse.ok && longPayload.access_token
    ? {
      accessToken: String(longPayload.access_token),
      expiresIn: Number(longPayload.expires_in || 0),
    }
    : { accessToken: String(payload.access_token), expiresIn: 0 };
}

async function connectInstagramLoginAccount(
  admin: ReturnType<typeof createClient>,
  userId: string,
  pageId: string,
  token: string,
  expiresIn: number,
) {
  const instagram = await instagramGraph("me", token, {
    fields: "id,user_id,username",
  });
  const accountId = String(instagram.user_id || instagram.id || "");
  if (!accountId) throw new Error("O Instagram não informou o ID da conta");
  const encrypted = await encryptToken(
    token,
    env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
  );
  const { data, error } = await admin
    .from("connected_accounts")
    .upsert(
      {
        user_id: userId,
        page_id: pageId,
        provider: "instagram",
        provider_account_id: accountId,
        provider_page_id: null,
        account_name: instagram.username
          ? `@${instagram.username}`
          : "Instagram profissional",
        encrypted_access_token: encrypted,
        token_expires_at: expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
        scopes: [
          "instagram_business_basic",
          "instagram_business_manage_insights",
        ],
        status: "connected",
        history_window_days: 90,
        sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
      },
      { onConflict: "provider,provider_account_id,user_id" },
    )
    .select("id,user_id,page_id,provider,provider_account_id,account_name,status,last_sync_at")
    .single();
  if (error) throw error;
  return data;
}

async function connectManagedAccounts(
  admin: ReturnType<typeof createClient>,
  userId: string,
  pageId: string,
  userToken: string,
) {
  const payload = await graph("me/accounts", userToken, {
    fields: "id,name,access_token,tasks,instagram_business_account{id,username}",
    limit: "100",
  });
  const managed = (payload.data || []).filter(
    (page: Record<string, unknown>) =>
      page.instagram_business_account && page.access_token,
  );
  if (!managed.length) {
    throw new Error("Nenhuma conta Business ou Creator vinculada às suas Páginas foi encontrada");
  }
  const rows = [];
  for (const page of managed) {
    const instagram = page.instagram_business_account as { id: string; username?: string };
    const encrypted = await encryptToken(
      String(page.access_token),
      env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
    );
    const { data, error } = await admin
      .from("connected_accounts")
      .upsert(
        {
          user_id: userId,
          page_id: pageId,
          provider: "instagram",
          provider_account_id: String(instagram.id),
          provider_page_id: String(page.id),
          account_name: instagram.username ? `@${instagram.username}` : String(page.name),
          encrypted_access_token: encrypted,
          scopes: [
            "instagram_basic",
            "instagram_manage_insights",
            "pages_read_engagement",
            "pages_show_list",
          ],
          status: "connected",
          history_window_days: 90,
          sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
        },
        { onConflict: "provider,provider_account_id,user_id" },
      )
      .select("id,user_id,page_id,provider,provider_account_id,account_name,status,last_sync_at")
      .single();
    if (error) throw error;
    rows.push(data);
  }
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) throw new Error("Unauthorized");
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", user.id)
      .single();
    if (!profile?.is_active) throw new Error("Forbidden");
    const body = await req.json();

    if (body.action === "disconnect") {
      let query = admin.from("connected_accounts").select("id,user_id").eq("id", body.account_id);
      if (profile.role !== "admin") query = query.eq("user_id", user.id);
      const { data: account } = await query.single();
      if (!account) throw new Error("Forbidden");
      const { error: disconnectError } = await admin
        .from("connected_accounts")
        .update({
          status: "disconnected",
          encrypted_access_token: "disconnected",
          token_expires_at: null,
        })
        .eq("id", account.id);
      if (disconnectError) throw disconnectError;
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "instagram.account.disconnected",
        entity_type: "connected_account",
        entity_id: account.id,
      });
      return json({ disconnected: true });
    }

    const pageId = String(body.page_id || "").trim();
    if (!pageId) throw new Error("Selecione a página do Copy News");
    const { data: internalPage } = await admin.from("pages").select("id").eq("id", pageId).eq("is_active", true).single();
    if (!internalPage) throw new Error("Página do Copy News inválida");

    let accessToken = "";
    if (body.action === "instagram_oauth_callback") {
      const exchanged = await exchangeInstagramCode(
        String(body.code || ""),
        String(body.redirect_uri || ""),
      );
      const account = await connectInstagramLoginAccount(
        admin,
        user.id,
        pageId,
        exchanged.accessToken,
        exchanged.expiresIn,
      );
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "instagram.account.connected",
        entity_type: "connected_account",
        entity_id: account.id,
        metadata: { login: "instagram" },
      });
      return json({ accounts: [account], count: 1 });
    } else if (body.action === "oauth_callback") {
      accessToken = await exchangeCode(String(body.code || ""), String(body.redirect_uri || ""));
    } else if (body.action === "connect_saved_token" && profile.role === "admin") {
      accessToken = env("META_ACCESS_TOKEN");
    } else if (body.action === "connect" && profile.role === "admin") {
      accessToken = String(body.access_token || "").trim();
    } else {
      throw new Error("Ação inválida");
    }
    if (!accessToken) throw new Error("Token da Meta ausente");
    const accounts = await connectManagedAccounts(admin, user.id, pageId, accessToken);
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "instagram.accounts.connected",
      entity_type: "profile",
      entity_id: user.id,
      metadata: { count: accounts.length },
    });
    return json({ accounts, count: accounts.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
