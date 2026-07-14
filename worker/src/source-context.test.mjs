import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceContext } from "./source-context.mjs";

test("permite vídeo sem fala quando o OCR contém fatos", () => {
  const context = buildSourceContext({
    transcript: "",
    ocr: { text: "Prefeitura anuncia novo calendário" },
  });
  assert.equal(context.transcript, null);
  assert.equal(context.ocr_text, "Prefeitura anuncia novo calendário");
});

test("bloqueia geração quando todas as fontes factuais estão vazias", () => {
  assert.throws(
    () => buildSourceContext({ metadata: { caption: " " }, transcript: "" }),
    (error) => error.code === "INSUFFICIENT_SOURCE",
  );
});
