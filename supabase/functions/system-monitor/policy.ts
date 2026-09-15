export type ServiceName = "worker" | "instagram" | "evolution";
export type ServiceProbe = { status?: string; [key: string]: unknown };
export type HealthSnapshot = { services?: Partial<Record<ServiceName, ServiceProbe>> };

const state = (snapshot: HealthSnapshot | undefined, service: ServiceName) =>
  snapshot?.services?.[service]?.status || "unknown";

export function consecutiveState(
  current: ServiceProbe,
  history: HealthSnapshot[],
  service: ServiceName,
  expected: "error" | "healthy",
) {
  const matches = (value: string) =>
    expected === "error" ? value === "error" : value === "ok" || value === "unverified";
  if (!matches(String(current.status || "unknown"))) return 0;
  let count = 1;
  for (const snapshot of history) {
    if (!matches(state(snapshot, service))) break;
    count += 1;
  }
  return count;
}

export function serviceFailureConfirmed(
  current: ServiceProbe,
  history: HealthSnapshot[],
  service: ServiceName,
  requiredFailures = 3,
) {
  return consecutiveState(current, history, service, "error") >= requiredFailures;
}

export function serviceRecoveryConfirmed(
  current: ServiceProbe,
  history: HealthSnapshot[],
  service: ServiceName,
  requiredSuccesses = 2,
) {
  return consecutiveState(current, history, service, "healthy") >= requiredSuccesses;
}

export function isInternalWorkerUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    return hostname.includes("_") || hostname === "localhost" || hostname.endsWith(".internal");
  } catch {
    return false;
  }
}

export function workerProbeForMonitor(url: string, stalled: number, probe?: ServiceProbe): ServiceProbe {
  if (isInternalWorkerUrl(url)) {
    return stalled > 0
      ? { status: "error", mode: "queue_observer", stalled }
      : { status: "unverified", mode: "queue_observer", reason: "internal_endpoint", stalled: 0 };
  }
  return probe || { status: "not_configured" };
}
