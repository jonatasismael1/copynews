import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  isInternalWorkerUrl,
  serviceFailureConfirmed,
  serviceRecoveryConfirmed,
  workerProbeForMonitor,
  type HealthSnapshot,
  type ServiceName,
} from "./policy.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const env = (name: string) => Deno.env.get(name)?.trim().replace(/^["']|["']$/g, "") || "";
const admin = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function probe(url: string, headers: Record<string, string> = {}) {
  if (!url) return { status: "not_configured" };
  let last = { status: "error", latency_ms: 0, error: "Indisponível", attempts: 0 } as Record<string, unknown>;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
      last = { status: response.ok ? "ok" : "error", http_status: response.status, latency_ms: Date.now() - started, attempts: attempt };
      if (response.ok || response.status < 500) return last;
    } catch (error) {
      last = { status: "error", latency_ms: Date.now() - started, attempts: attempt, error: error instanceof Error ? error.message.slice(0, 160) : "Indisponível" };
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return last;
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
    signal: AbortSignal.timeout(4000),
  }).catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  const db = admin();
  const workerUrl = env("WORKER_HEALTH_URL");
  const [workerNetworkProbe, instagram, evolution, organizations, backup, queued] = await Promise.all([
    isInternalWorkerUrl(workerUrl) ? Promise.resolve(undefined) : probe(workerUrl),
    probe(`${env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/, "")}/health`),
    probe(`${env("EVOLUTION_API_URL").replace(/\/$/, "")}/instance/connectionState/${env("EVOLUTION_INSTANCE")}`, { apikey: env("EVOLUTION_API_KEY") }),
    db.from("organizations").select("id"),
    db.from("database_backup_runs").select("status,started_at,restore_verified_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("processing_jobs").select("id,status,created_at,lease_expires_at").in("status", ["queued", "running", "retrying"]),
  ]);
  const backupAge = backup.data?.restore_verified_at ? Date.now() - new Date(backup.data.restore_verified_at).getTime() : Number.POSITIVE_INFINITY;
  const stalled = (queued.data || []).filter((job) => Date.now() - new Date(job.created_at).getTime() > 15 * 60_000).length;
  const worker = workerProbeForMonitor(workerUrl, stalled, workerNetworkProbe);
  const services = { worker, instagram, evolution };
  const serviceDefinitions: { service: ServiceName; type: string; title: string }[] = [
    { service: "worker", type: "worker_offline", title: "Worker do Copy News está offline" },
    { service: "instagram", type: "instagram_offline", title: "Serviço do Instagram está offline" },
    { service: "evolution", type: "evolution_offline", title: "Evolution API está offline" },
  ];
  for (const organization of organizations.data || []) {
    const { data: recent } = await db
      .from("system_health_snapshots")
      .select("services")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(2);
    const history = (recent || []) as HealthSnapshot[];
    const serviceIssues = serviceDefinitions
      .filter(({ service }) => serviceFailureConfirmed(services[service], history, service))
      .map(({ service, type, title }) => ({
        type,
        severity: "critical" as const,
        title,
        failure_streak: 1 + history.filter((item) => item.services?.[service]?.status === "error").length,
      }));
    const issues = [
      ...serviceIssues,
      backupAge > 26 * 3600_000 && { type: "backup_stale", severity: backupAge > 48 * 3600_000 ? "critical" as const : "warning" as const, title: "Backup do banco está atrasado" },
      stalled > 0 && { type: "stalled_queue", severity: stalled > 3 ? "critical" as const : "warning" as const, title: `${stalled} processamento(s) aguardando há mais de 15 minutos` },
    ].filter(Boolean) as { type: string; severity: "warning" | "critical"; title: string; failure_streak?: number }[];
    const activeTypes = issues.map((issue) => issue.type);
    const overall = issues.some((issue) => issue.severity === "critical") ? "critical" : issues.length ? "warning" : "ok";
    await db.from("system_health_snapshots").insert({ organization_id: organization.id, overall_status: overall, services, queues: { active: queued.data?.length || 0, stalled }, storage: {} });
    for (const issue of issues) {
      const dedupe = `system:${issue.type}`;
      const { data: existing } = await db.from("distribution_operational_alerts").select("id,occurrences").eq("organization_id", organization.id).eq("dedupe_key", dedupe).eq("status", "open").maybeSingle();
      if (existing) await db.from("distribution_operational_alerts").update({ occurrences: existing.occurrences + 1, last_seen_at: new Date().toISOString(), details: { ...services, stalled, failure_streak: issue.failure_streak || null } }).eq("id", existing.id);
      else {
        await db.from("distribution_operational_alerts").insert({ organization_id: organization.id, alert_type: issue.type, severity: issue.severity, title: issue.title, dedupe_key: dedupe, details: { ...services, stalled, failure_streak: issue.failure_streak || null } });
        if (issue.severity === "critical") await notifyCritical(`⚠️ *Alerta do Copy News*\n\n${issue.title}\nHorário: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Maceio" })}`);
      }
    }
    for (const definition of serviceDefinitions) {
      if (activeTypes.includes(definition.type)) continue;
      if (!serviceRecoveryConfirmed(services[definition.service], history, definition.service)) continue;
      await db.from("distribution_operational_alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("organization_id", organization.id).eq("alert_type", definition.type).eq("status", "open");
    }
    const nonServiceTypes = ["backup_stale", "stalled_queue"];
    for (const type of nonServiceTypes) {
      if (activeTypes.includes(type)) continue;
      await db.from("distribution_operational_alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("organization_id", organization.id).eq("alert_type", type).eq("status", "open");
    }
  }
  return json({ ok: true, services, stalled });
});
