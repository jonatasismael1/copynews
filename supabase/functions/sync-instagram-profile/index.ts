import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};

function env(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function username(value: unknown) {
  const normalized = String(value || "").trim().replace(/\/$/, "").split("/").pop()?.replace(/^@/, "").toLowerCase();
  if (!normalized || !/^[a-z0-9._]{1,30}$/.test(normalized)) throw new Error("Perfil do Instagram inválido");
  return normalized;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = env("SUPABASE_URL");
    const service = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cronAllowed = request.headers.get("x-cron-secret") === Deno.env.get("SYNC_INSTAGRAM_CRON_SECRET");
    let organizationId: string | null = null;
    if (!cronAllowed) {
      const authorization = request.headers.get("authorization") || "";
      const auth = createClient(supabaseUrl, env("SUPABASE_ANON_KEY"), {
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error: userError } = await auth.auth.getUser();
      if (userError || !user) return json({ error: "Não autorizado" }, 401);
      const { data: member } = await service.from("profiles").select("organization_id,is_active").eq("id", user.id).maybeSingle();
      if (!member?.is_active) return json({ error: "Usuário inativo" }, 403);
      organizationId = member.organization_id;
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (body.all_profiles === true) {
      const apiBase = env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/, "");
      const apiHeaders = { "X-API-Key": env("INSTAGRAM_ANALYTICS_API_KEY") };
      const requestedAt = typeof body.requested_at === "string" ? body.requested_at : null;
      if (!requestedAt) {
        const startedAt = new Date().toISOString();
        const start = await fetch(`${apiBase}/instagram/collect`, { method: "POST", headers: apiHeaders });
        if (!start.ok) throw new Error(`Instagram API HTTP ${start.status}: ${await start.text()}`);
        return json({ pending: true, all_profiles: true, requested_at: startedAt }, 202);
      }
      const runsResponse = await fetch(`${apiBase}/instagram/runs?limit=5`, { headers: apiHeaders });
      if (!runsResponse.ok) throw new Error(`Instagram API HTTP ${runsResponse.status}: ${await runsResponse.text()}`);
      const runs = await runsResponse.json() as Array<Record<string, unknown>>;
      const run = runs.find((item) => item.trigger === "manual" && String(item.started_at || "") >= requestedAt);
      if (!run || run.status === "running") return json({ pending: true, all_profiles: true, requested_at: requestedAt }, 202);
      if (run.status === "error") return json({ error: run.error || "A coleta do Instagram falhou" }, 502);
      const { data: fixedProfiles, error: fixedError } = await service.from("tracked_instagram_profiles").select("*").eq("is_fixed", true).order("username");
      if (fixedError) throw fixedError;
      return json({ pending: false, all_profiles: true, profiles: fixedProfiles || [], run });
    }
    let query = service.from("tracked_instagram_profiles").select("*");
    if (body.profile_id) query = query.eq("id", String(body.profile_id));
    else query = query.eq("username", username(body.profile));
    if (organizationId) query = query.eq("organization_id", organizationId);
    let { data: profile, error: profileError } = await query.maybeSingle();

    if (!profile && !body.profile_id) {
      const response = await fetch(`${env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/, "")}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": env("INSTAGRAM_ANALYTICS_API_KEY") },
        body: JSON.stringify({ username: username(body.profile) }),
      });
      if (!response.ok) throw new Error(`Instagram API HTTP ${response.status}: ${await response.text()}`);
      profile = await response.json();
      profileError = null;
    }
    if (profileError || !profile) return json({ error: "Perfil não encontrado" }, 404);

    const age = profile.last_sync_at ? Date.now() - new Date(profile.last_sync_at).getTime() : Number.POSITIVE_INFINITY;
    if (["instagram-api", "apify"].includes(profile.sync_provider ?? "") && age < 10 * 60_000) {
      if (profile.last_sync_status === "pending") return json({ pending: true, profile });
      if (profile.last_sync_status === "error") return json({ error: profile.last_error || "A coleta do Instagram falhou" }, 502);
    }
    if (profile.last_sync_status === "success" && age < 10 * 60_000 && body.profile_id) {
      return json({ pending: false, profile, imported: 0, posts_today: 0 });
    }

    const response = await fetch(`${env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/, "")}/profiles/${profile.username}/refresh`, {
      method: "POST",
      headers: { "X-API-Key": env("INSTAGRAM_ANALYTICS_API_KEY") },
    });
    if (!response.ok) throw new Error(`Instagram API HTTP ${response.status}: ${await response.text()}`);
    return json({ pending: true, profile: { ...profile, last_sync_status: "pending", sync_provider: "instagram-api" } }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Falha na coleta do Instagram" }, 500);
  }
});
