import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySources,
  formatSocialParagraphs,
  generateCopy,
  isUsableTitle,
  transcribeAudio,
  validateCopy,
} from "./openrouter.mjs";

const classify = (input) => classifySources({ ocrConfidence: 0.9, ...input });
const result = (sources, title, caption = sources.originalCaption || sources.articleBody || title) => ({
  title,
  caption,
  sourceMode: sources.sourceMode,
  titleSources: ["originalTitle"],
  preservedFacts: [],
  warnings: [],
});

test("separa legendas em parágrafos curtos para redes sociais", () => {
  assert.equal(
    formatSocialParagraphs("Primeiro fato confirmado. Segundo fato confirmado. Desfecho da notícia."),
    "Primeiro fato confirmado. Segundo fato confirmado.\n\nDesfecho da notícia.",
  );
});

test("título completo usa title_only e pode permanecer praticamente igual", () => {
  const sources = classify({ originalTitle: "Prefeitura de Maceió inaugura nova escola no bairro Pontal nesta terça-feira", originalCaption: "A unidade foi inaugurada nesta terça-feira." });
  assert.equal(sources.sourceMode, "title_only");
  assert.deepEqual(validateCopy(result(sources, sources.originalTitle), sources), []);
});

test("título incompleto usa somente a legenda para complementar", () => {
  const sources = classify({ originalTitle: "Motorista é preso após colisão", originalCaption: "O motorista colidiu com uma motocicleta em Arapiraca." });
  assert.equal(sources.sourceMode, "title_plus_caption");
  assert.deepEqual(validateCopy(result(sources, "Motorista é preso após colisão com motocicleta em Arapiraca"), sources), []);
});

test("ausência de título gera caption_only", () => {
  assert.equal(classify({ originalCaption: "A Câmara aprovou o projeto por unanimidade." }).sourceMode, "caption_only");
});

test("título genérico é ignorado em favor da legenda", () => {
  const sources = classify({ originalTitle: "Confira o que aconteceu", originalCaption: "Defesa Civil interdita ponte após vistoria em Pilar." });
  assert.equal(sources.originalTitle, "");
  assert.equal(sources.sourceMode, "caption_only");
});

test("OCR ilegível ou de baixa confiança não vira fato", () => {
  assert.equal(isUsableTitle("PR3F3!TUR@ ###", { ocrConfidence: 0.3 }), false);
  assert.equal(classify({ ocrTitle: "PR3F3!TUR@ ###", ocrConfidence: 0.3, originalCaption: "Prefeitura anuncia calendário." }).sourceMode, "caption_only");
});

test("crítica direta preserva nome e teor", () => {
  const sources = classify({ originalTitle: "Vereador João Silva critica atraso da Prefeitura de Maceió em obra pública" });
  const violations = validateCopy(result(sources, "Vereador critica atraso em obra pública"), sources);
  assert.ok(violations.some((item) => /Nome próprio removido/.test(item)));
});

test("denúncia não pode virar fato confirmado", () => {
  const sources = classify({ originalTitle: "Segundo promotora, empresa é acusada de fraude em contrato público" });
  const violations = validateCopy(result(sources, "Empresa comete fraude em contrato público"), sources);
  assert.ok(violations.some((item) => /Nível de certeza removido/.test(item)));
});

test("contradição entre título e legenda exige manual_review sem mistura", () => {
  const sources = classify({ originalTitle: "Motociclista fica ferido após colisão em Maceió", originalCaption: "O motociclista morreu após atropelamento em Maceió." });
  assert.equal(sources.sourceMode, "manual_review");
  assert.ok(sources.contradictions.length >= 1);
});

test("título seguro abaixo de 80 caracteres é aceito", () => {
  const sources = classify({ originalTitle: "TRE rejeita pedido em Alagoas" });
  assert.deepEqual(validateCopy(result(sources, sources.originalTitle), sources), []);
});

test("título acima de 150 caracteres é reprovado", () => {
  const longTitle = `Prefeitura anuncia ${"novas medidas para o município ".repeat(6)}`;
  const sources = classify({ originalTitle: longTitle });
  assert.ok(validateCopy(result(sources, longTitle), sources).some((item) => /150/.test(item)));
});

test("caso real preserva colisão, feridos e local e rejeita fatos inventados", () => {
  const sources = classify({
    originalTitle: "MOTORISTA EMBRIAGADO É PRESO APÓS COLIDIR COM MOTO E DEIXAR FERIDOS EM PALMEIRA",
    originalCaption: "Um motorista sob forte efeito de bebidas alcoólicas colidiu contra uma motocicleta, deixando 2 pessoas feridas no bairro Graciliano Ramos, em Palmeira dos Índios.",
  });
  const allowed = "Motorista embriagado é preso após colidir com moto e deixar 2 feridos em Palmeira dos Índios";
  assert.deepEqual(validateCopy(result(sources, allowed), sources), []);
  for (const invented of ["atropelamento", "morte", "fuga", "hospitalização", "10º Batalhão", "delegado José"])
    assert.ok(validateCopy(result(sources, `${allowed} ${invented}`), sources).length > 0, invented);
});

test("article_fallback usa somente conteúdo extraído do link", () => {
  assert.equal(classify({ articleBody: "O corpo da matéria informa a decisão judicial." }).sourceMode, "article_fallback");
  assert.equal(classify({ originalCaption: "Veja mais", articleBody: "O corpo da matéria informa a decisão judicial." }).sourceMode, "article_fallback");
});

test("usa parâmetros conservadores e JSON Schema estrito no OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Defesa Civil interdita ponte após vistoria em Pilar",
      caption: "Defesa Civil interdita ponte após vistoria em Pilar.",
      sourceMode: "caption_only",
      titleSources: ["originalCaption"],
      preservedFacts: ["ponte interditada"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await generateCopy({ source_caption: "Defesa Civil interdita ponte após vistoria em Pilar." }, "key", "model");
    assert.equal(request.temperature, 0);
    assert.equal(request.top_p, 1);
    assert.equal(request.stream, false);
    assert.equal(request.provider.require_parameters, true);
    assert.equal("frequency_penalty" in request, false);
    assert.equal("presence_penalty" in request, false);
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.response_format.json_schema.schema.additionalProperties, false);
    assert.match(request.messages[0].content, /Colisão não é atropelamento/);
    assert.match(request.messages[1].content, /TÍTULO ORIGINAL:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("faz uma única correção e mantém originais quando a repetição falha", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Motorista causa atropelamento e morre após fuga",
      caption: "Motorista causa atropelamento e morre após fuga.",
      sourceMode: "title_only",
      titleSources: ["originalTitle"],
      preservedFacts: [],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const originalTitle = "Motorista é preso após colisão e deixa ferido em Maceió";
    const generated = await generateCopy({ original_title: originalTitle }, "key", "model");
    assert.equal(calls, 2);
    assert.equal(generated.title, originalTitle);
    assert.equal(generated.sourceMode, "manual_review");
    assert.ok(generated.warnings.some((item) => /revisão manual/.test(item)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usa o endpoint dedicado de transcrição do OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ text: "  transcrição real  " }), { status: 200 });
  };
  try {
    assert.equal(await transcribeAudio("audio", "key", "whisper"), "transcrição real");
    assert.equal(request.url, "https://openrouter.ai/api/v1/audio/transcriptions");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("propaga falha da transcrição como erro do OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(() => transcribeAudio("audio", "key", "whisper"), (error) => error.code === "OPENROUTER_ERROR");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
