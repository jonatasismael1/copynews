import test from "node:test";
import assert from "node:assert/strict";
import { imageMime, isCompatibleVideo } from "./distribution.mjs";

test("detecta JPEG e PNG pelo conteúdo, não apenas pela extensão", () => {
  assert.deepEqual(imageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00])), { mime: "image/jpeg", extension: ".jpg" });
  assert.deepEqual(imageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47])), { mime: "image/png", extension: ".png" });
});

test("aceita somente MP4 H.264 com AAC ou sem áudio", () => {
  assert.equal(isCompatibleVideo({ container: "mov,mp4,m4a,3gp,3g2,mj2", videoCodec: "h264", audioCodec: "aac" }), true);
  assert.equal(isCompatibleVideo({ container: "mov,mp4", videoCodec: "h264", audioCodec: null }), true);
  assert.equal(isCompatibleVideo({ container: "matroska,webm", videoCodec: "vp9", audioCodec: "opus" }), false);
  assert.equal(isCompatibleVideo({ container: "mov,mp4", videoCodec: "hevc", audioCodec: "aac" }), false);
});
