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

test("mantém título, legenda, corpo e OCR em campos separados", () => {
  const context = buildSourceContext({
    metadata: { title: "Título original", caption: "Legenda original", articleBody: "Corpo da matéria" },
    transcript: "Transcrição",
    ocr: { text: "Título no vídeo", confidence: 0.91 },
  });
  assert.equal(context.original_title, "Título original");
  assert.equal(context.source_caption, "Legenda original");
  assert.equal(context.article_body, "Corpo da matéria");
  assert.equal(context.ocr_text, "Título no vídeo");
  assert.equal(context.ocr_confidence, 0.91);
});

test("bloqueia geração quando todas as fontes factuais estão vazias", () => {
  assert.throws(
    () => buildSourceContext({ metadata: { caption: " " }, transcript: "" }),
    (error) => error.code === "INSUFFICIENT_SOURCE",
  );
});
