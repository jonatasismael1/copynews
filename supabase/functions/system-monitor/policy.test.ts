import { describe, expect, it } from "vitest";
import {
  isInternalWorkerUrl,
  serviceFailureConfirmed,
  serviceRecoveryConfirmed,
  workerProbeForMonitor,
} from "./policy";

const snapshot = (service: "worker" | "instagram" | "evolution", status: string) => ({
  services: { [service]: { status } },
});

describe("system monitor policy", () => {
  it("ignores an isolated timeout and confirms three consecutive failures", () => {
    expect(serviceFailureConfirmed({ status: "error" }, [snapshot("instagram", "ok")], "instagram")).toBe(false);
    expect(serviceFailureConfirmed(
      { status: "error" },
      [snapshot("instagram", "error"), snapshot("instagram", "error")],
      "instagram",
    )).toBe(true);
  });

  it("requires two healthy checks before resolving an incident", () => {
    expect(serviceRecoveryConfirmed({ status: "ok" }, [snapshot("evolution", "error")], "evolution")).toBe(false);
    expect(serviceRecoveryConfirmed({ status: "ok" }, [snapshot("evolution", "ok")], "evolution")).toBe(true);
  });

  it("does not call an internal swarm hostname from an edge function", () => {
    const url = "http://copy-news-worker_copy-news-worker:8080/health";
    expect(isInternalWorkerUrl(url)).toBe(true);
    expect(workerProbeForMonitor(url, 0)).toMatchObject({ status: "unverified", mode: "queue_observer" });
    expect(workerProbeForMonitor(url, 2)).toMatchObject({ status: "error", stalled: 2 });
  });
});
