import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = (name: string) => Deno.env.get(name)?.trim().replace(/^["']|["']$/g, "") || "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function probe(url: string, headers: Record<string, string> = {}) {
  if (!url) return { status: "not_configured" };
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    return { status: response.ok ? "ok" : "error", http_status: response.status, latency_ms: Date.now() - started };
  } catch (error) {
    return { status: "error", latency_ms: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 160) : "Indisponível" };
  }
}

async function notifyCritical(message: string) {
  const url = env("EVOLUTION_API_URL").replace(/\/$/, "");
  const key = env("EVOLUTION_API_KEY");
  const instance = env("EVOLUTION_INSTANCE");
  const number = env("INSTAGRAM_ALERT_PHONE").replace(/\D/g, "");
  if (!url || !key || !instance || !number) return;
  await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number, text: message }),
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  const db = admin();
  const [worker, instagram, evolution, organizations, backup, queued] = await Promise.all([
    probe(env("WORKER_HEALTH_URL")),
    probe(`${env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/, "")}/health`),
    probe(`${env("EVOLUTION_API_URL").replace(/\/$/, "")}/instance/connectionState/${env("EVOLUTION_INSTANCE")}`, { apikey: env("EVOLUTION_API_KEY") }),
    db.from("organizations").select("id"),
    db.from("database_backup_runs").select("status,started_at,restore_verified_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("processing_jobs").select("id,status,created_at,lease_expires_at").in("status", ["queued", "running", "retrying"]),
  ]);
  const backupAge = backup.data?.restore_verified_at ? Date.now() - new Date(backup.data.restore_verified_at).getTime() : Number.POSITIVE_INFINITY;
  const stalled = (queued.data || []).filter((job) => Date.now() - new Date(job.created_at).getTime() > 15 * 60_000).length;
  const issues = [
    worker.status === "error" && { type: "worker_offline", severity: "critical", title: "Worker do Copy News está offline" },
    instagram.status === "error" && { type: "instagram_offline", severity: "critical", title: "Serviço do Instagram está offline" },
    evolution.status === "error" && { type: "evolution_offline", severity: "critical", title: "Evolution API está offline" },
    backupAge > 26 * 3600_000 && { type: "backup_stale", severity: backupAge > 48 * 3600_000 ? "critical" : "warning", title: "Backup do banco está atrasado" },
    stalled > 0 && { type: "stalled_queue", severity: stalled > 3 ? "critical" : "warning", title: `${stalled} processamento(s) aguardando há mais de 15 minutos` },
  ].filter(Boolean) as { type: string; severity: "warning" | "critical"; title: string }[];
  const activeTypes = issues.map((issue) => issue.type);
  for (const organization of organizations.data || []) {
    const overall = issues.some((issue) => issue.severity === "critical") ? "critical" : issues.length ? "warning" : "ok";
    await db.from("system_health_snapshots").insert({ organization_id: organization.id, overall_status: overall, services: { worker, instagram, evolution }, queues: { active: queued.data?.length || 0, stalled }, storage: {} });
    for (const issue of issues) {
      const dedupe = `system:${issue.type}`;
      const { data: existing } = await db.from("distribution_operational_alerts").select("id,occurrences").eq("organization_id", organization.id).eq("dedupe_key", dedupe).eq("status", "open").maybeSingle();
      if (existing) await db.from("distribution_operational_alerts").update({ occurrences: existing.occurrences + 1, last_seen_at: new Date().toISOString(), details: { worker, instagram, evolution, stalled } }).eq("id", existing.id);
      else {
        await db.from("distribution_operational_alerts").insert({ organization_id: organization.id, alert_type: issue.type, severity: issue.severity, title: issue.title, dedupe_key: dedupe, details: { worker, instagram, evolution, stalled } });
        if (issue.severity === "critical") await notifyCritical(`⚠️ *Alerta do Copy News*\n\n${issue.title}\nHorário: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Maceio" })}`);
      }
    }
    let resolveQuery = db.from("distribution_operational_alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("organization_id", organization.id).like("dedupe_key", "system:%").eq("status", "open");
    if (activeTypes.length) resolveQuery = resolveQuery.not("alert_type", "in", `(${activeTypes.join(",")})`);
    await resolveQuery;
  }
  return json({ ok: true, issues: issues.length, stalled });
});
