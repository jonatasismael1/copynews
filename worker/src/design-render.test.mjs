import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVideoRenderArgs,
  calculateMediaFrame,
  outputDimensions,
} from "./design-render.mjs";

test("vídeo horizontal usa cover central sem deformação", () => {
  const frame = calculateMediaFrame(1920, 1080, { fit: "cover", zoom: 1 });
  assert.equal(frame.height, 1920);
  assert.ok(frame.width > 1080);
  assert.ok(Math.abs(frame.width / frame.height - 1920 / 1080) < 0.001);
  assert.ok(frame.x < 0);
});

test("vídeo vertical restaura zoom e deslocamento dentro da área", () => {
  const frame = calculateMediaFrame(1080, 1920, {
    fit: "cover",
    zoom: 1.5,
    offsetX: 100,
    offsetY: -150,
  });
  assert.equal(frame.width, 1620);
  assert.equal(frame.height, 2880);
  assert.equal(frame.x, -170);
  assert.equal(frame.y, -630);
});

test("renderização mantém áudio e produz MP4 compatível", () => {
  const args = buildVideoRenderArgs(
    "source.mp4",
    "overlay.png",
    "output.mp4",
    calculateMediaFrame(1080, 1920),
  );
  assert.deepEqual(args.slice(args.indexOf("-map"), args.indexOf("-c:v")), [
    "-map",
    "[outv]",
    "-map",
    "0:a?",
  ]);
  assert.ok(args.includes("yuv420p"));
  assert.ok(args.includes("+faststart"));
});

test("renderização respeita as dimensões próprias de cada formato", () => {
  assert.deepEqual(outputDimensions("story"), { width: 1080, height: 1920 });
  assert.deepEqual(outputDimensions("portrait"), { width: 1080, height: 1350 });
  assert.deepEqual(outputDimensions("square"), { width: 1080, height: 1080 });
  const dimensions = outputDimensions("square");
  const frame = calculateMediaFrame(1920, 1080, { fit: "cover" }, dimensions);
  const args = buildVideoRenderArgs(
    "source.mp4",
    "overlay.png",
    "output.mp4",
    frame,
    dimensions,
  );
  assert.ok(args.some((value) => value.includes("s=1080x1080")));
});
