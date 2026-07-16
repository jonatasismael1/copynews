import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceContext } from "./source-context.mjs";

test("não usa OCR bruto como fonte quando não há conteúdo editorial", () => {
  assert.throws(
    () => buildSourceContext({ transcript: "", ocr: { text: "Logo 7 Segundos" } }),
    (error) => error.code === "INSUFFICIENT_SOURCE",
  );
});

test("permite vídeo sem fala quando o OCR extraiu um título limpo", () => {
  const context = buildSourceContext({
    transcript: "",
    ocr: {
      text: "Logo e telefone 82 99999-9999",
      title: "Prefeitura anuncia novo calendário",
    },
  });
  assert.equal(context.transcript, null);
  assert.equal(context.original_title, "Prefeitura anuncia novo calendário");
  assert.equal("raw_ocr_text" in context, false);
  assert.equal("ocr_text" in context, false);
});

test("mantém título, legenda, corpo e OCR em campos separados", () => {
  const context = buildSourceContext({
    metadata: { title: "Título original", caption: "Legenda original", articleBody: "Corpo da matéria" },
    transcript: "Transcrição",
    ocr: { text: "Logo e outros textos", title: "Título no vídeo", confidence: 0.91 },
  });
  assert.equal(context.original_title, "Título original");
  assert.equal(context.original_caption, "Legenda original");
  assert.equal(context.clean_original_caption, "Legenda original");
  assert.equal(context.article_body, "Corpo da matéria");
  assert.equal("ocr_text" in context, false);
});

test("bloqueia geração quando todas as fontes factuais estão vazias", () => {
  assert.throws(
    () => buildSourceContext({ metadata: { caption: " " }, transcript: "" }),
    (error) => error.code === "INSUFFICIENT_SOURCE",
  );
});
