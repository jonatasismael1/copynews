import assert from "node:assert/strict";
import test from "node:test";
import { temporalSamplePlan } from "./frame-sampling.mjs";

test("distribui cinco quadros por cerca de 82% do vídeo", () => {
  const plan = temporalSamplePlan(35.5, 8);
  const lastTimestamp = plan.start + plan.interval * (plan.count - 1);
  assert.equal(plan.count, 5);
  assert.ok(lastTimestamp >= 29 && lastTimestamp <= 29.3);
});

test("limita a amostragem e mantém fallback para duração inválida", () => {
  assert.deepEqual(temporalSamplePlan(Number.NaN, 8), {
    count: 5,
    start: 0,
    interval: null,
  });
  assert.equal(temporalSamplePlan(12, 1).count, 1);
});
