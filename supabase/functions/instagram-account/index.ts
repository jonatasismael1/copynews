import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
function env(name: string) { const value = Deno.env.get(name); if (!value) throw new Error(`Missing environment variable: ${name}`); return value; }
const version = () => Deno.env.get("META_GRAPH_API_VERSION") || "v24.0";

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
    if (!profile?.is_active || profile.role !== "admin") throw new Error("Forbidden");
    const body = await req.json();
    if (body.action === "disconnect") {
      const { error: disconnectError } = await admin.from("connected_accounts").update({ status: "disconnected", encrypted_access_token: "disconnected", token_expires_at: null }).eq("id", body.account_id);
      if (disconnectError) throw disconnectError;
      return json({ disconnected: true });
    }
    const accessToken = String(body.access_token || "").trim();
    const pageId = String(body.page_id || "").trim();
    if (!accessToken || !pageId) throw new Error("Informe a página e o token da conta profissional");
    const checkUrl = new URL(`https://graph.instagram.com/${version()}/me`);
    checkUrl.searchParams.set("fields", "id,username,account_type");
    checkUrl.searchParams.set("access_token", accessToken);
    const checked = await fetch(checkUrl, { signal: AbortSignal.timeout(15000) });
    const account = await checked.json();
    if (!checked.ok || !account.id) throw new Error("Token do Instagram inválido ou sem permissão");
    const encrypted = await encryptToken(accessToken, env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"));
    const { data, error: upsertError } = await admin.from("connected_accounts").upsert({
      page_id: pageId,
      provider: "instagram",
      provider_account_id: String(account.id),
      encrypted_access_token: encrypted,
      scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
      status: "connected",
      history_window_days: 90,
      sync_from: new Date(Date.now() - 90 * 86400000).toISOString(),
    }, { onConflict: "provider,provider_account_id" }).select("id,page_id,provider,provider_account_id,status,last_sync_at").single();
    if (upsertError) throw upsertError;
    await admin.from("audit_logs").insert({ user_id: user.id, action: "instagram.account.connected", entity_type: "connected_account", entity_id: data.id, metadata: { username: account.username || null } });
    return json({ ...data, username: account.username || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return json({ error: message }, message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400);
  }
});
