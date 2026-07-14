import test from "node:test";
import assert from "node:assert/strict";
import { editorMediaType, shouldTranscribe } from "./processing-options.mjs";

test("transcrição só é executada quando ativada explicitamente", () => {
  assert.equal(shouldTranscribe({ transcribe_audio: true }), true);
  assert.equal(shouldTranscribe({ transcribe_audio: false }), false);
  assert.equal(shouldTranscribe({}), false);
});

test("carrossel de imagens usa o editor de imagem", () => {
  assert.equal(
    editorMediaType({
      media_kind: "carousel",
      media_items: [{ kind: "image" }, { kind: "image" }],
    }),
    "image",
  );
  assert.equal(
    editorMediaType({
      media_kind: "carousel",
      media_items: [{ kind: "image" }, { kind: "video" }],
    }),
    "video",
  );
});
