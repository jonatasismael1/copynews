import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySources,
  cleanSourceCaption,
  formatSocialParagraphs,
  generateCopy,
  isUsableTitle,
  normalizeHeadlineCase,
  transcribeAudio,
  validateCopy,
} from "./openrouter.mjs";

const classify = (input) => classifySources({ ocrConfidence: 0.9, ...input });
const result = (sources, title, caption = sources.captionSource || title) => ({
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

test("título completo usa title_only, preserva fatos e recebe edição de estrutura", () => {
  const sources = classify({ originalTitle: "Prefeitura de Maceió inaugura nova escola no bairro Pontal nesta terça-feira", originalCaption: "A unidade foi inaugurada nesta terça-feira." });
  assert.equal(sources.sourceMode, "title_only");
  assert.deepEqual(
    validateCopy(
      result(
        sources,
        "Prefeitura de Maceió inaugura nesta terça-feira nova escola no bairro Pontal",
      ),
      sources,
    ),
    [],
  );
  assert.ok(
    validateCopy(result(sources, sources.originalTitle), sources).some((item) =>
      /copiado literalmente/.test(item),
    ),
  );
});

test("remove rodapé promocional da legenda sem retirar o conteúdo jornalístico", () => {
  assert.equal(
    cleanSourceCaption(
      "Primeiro fato confirmado.\n\nSegundo fato confirmado.\n\nAcesse a matéria completa em nosso site\n\n📲(82) 99999-9999",
    ),
    "Primeiro fato confirmado.\n\nSegundo fato confirmado.",
  );
});

test("título OCR em caixa alta vira escrita normal e usa a legenda para explicar HGE", () => {
  const sources = classify({
    ocrTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
    originalCaption: "A fiscalização ocorreu nos dias 9 e 10 no Hospital Geral do Estado.",
  });
  assert.equal(
    sources.originalTitle,
    "Vigilância sanitária notifica HGE após flagrar irregularidades em fiscalização",
  );
  assert.equal(sources.sourceMode, "title_plus_caption");
});

test("preserva siglas ao normalizar manchetes que vieram em caixa alta", () => {
  assert.equal(
    normalizeHeadlineCase(
      "PF INVESTIGA HGE APÓS DENÚNCIA EM AL",
      "A PF investiga o Hospital Geral do Estado (HGE), em AL.",
    ),
    "PF investiga HGE após denúncia em AL",
  );
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
  const allowed = "Após colidir com moto e deixar feridos em Palmeira, motorista embriagado é preso";
  assert.deepEqual(validateCopy(result(sources, allowed), sources), []);
  for (const invented of ["atropelamento", "morte", "fuga", "hospitalização", "10º Batalhão", "delegado José"])
    assert.ok(validateCopy(result(sources, `${allowed} ${invented}`), sources).length > 0, invented);
});

test("fallback de revisão manual também nunca ultrapassa 150 caracteres", async () => {
  const generated = await generateCopy(
    {
      original_title: `Motociclista fica ferido após colisão ${"em trecho da rodovia estadual ".repeat(6)}`,
      source_caption: "O motociclista morreu após atropelamento no mesmo local.",
    },
    "unused",
    "unused",
  );
  assert.equal(generated.sourceMode, "manual_review");
  assert.ok(generated.title.length <= 150);
});

test("rejeita a notícia inventada sobre São Gonçalo, Covid e ocupação de UTI", () => {
  const sources = classify({
    ocrTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
    originalCaption: "A Vigilância Sanitária de Maceió encontrou camas enferrujadas, teto aberto e fiação exposta durante fiscalização no HGE.",
  });
  const invented = result(
    sources,
    "Hospital de Campanha de São Gonçalo está com 100% dos leitos de UTI ocupados",
    "A Prefeitura de São Gonçalo informou que a unidade atende pacientes com Covid-19 e possui 20 leitos de UTI.",
  );
  const violations = validateCopy(invented, sources);
  assert.ok(violations.some((item) => /Entidade nova no título/.test(item)));
  assert.ok(violations.some((item) => /Número novo/.test(item)));
});

test("aceita edição forte e fiel da manchete do HGE em capitalização normal", () => {
  const sources = classify({
    ocrTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
    originalCaption: "A Vigilância Sanitária de Maceió encontrou irregularidades graves durante fiscalização no Hospital Geral do Estado (HGE) e notificou o hospital.",
  });
  const edited = result(
    sources,
    "Vigilância Sanitária encontra irregularidades graves no HGE durante fiscalização e notifica hospital",
  );
  edited.sourceMode = "title_plus_caption";
  edited.titleSources = ["originalTitle", "originalCaption"];
  assert.deepEqual(validateCopy(edited, sources), []);
  assert.ok(edited.title.length <= 150);
});

test("article_fallback usa somente conteúdo extraído do link", () => {
  const article = classify({ articleBody: "O corpo da matéria informa a decisão judicial." });
  assert.equal(article.sourceMode, "article_fallback");
  assert.equal(article.supplementalKind, "articleBody");
  assert.equal(classify({ originalCaption: "Veja mais", articleBody: "O corpo da matéria informa a decisão judicial." }).sourceMode, "article_fallback");
});

test("título do OCR usa a transcrição para gerar a legenda quando não há legenda original", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Prefeitura anuncia reforma da ponte após vistoria técnica",
      caption: "A Prefeitura anunciou a reforma da ponte após uma vistoria técnica realizada nesta quarta-feira.",
      sourceMode: "title_only",
      titleSources: ["originalTitle"],
      preservedFacts: ["reforma da ponte"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const generated = await generateCopy(
      {
        ocr_text: "PREFEITURA ANUNCIA REFORMA DA PONTE APÓS VISTORIA TÉCNICA",
        ocr_confidence: 0.95,
        transcript: "A Prefeitura anunciou a reforma da ponte após uma vistoria técnica realizada nesta quarta-feira.",
      },
      "key",
      "model",
    );
    assert.equal(generated.sourceMode, "title_only");
    assert.match(generated.caption, /vistoria técnica realizada nesta quarta-feira/);
    assert.match(request.messages[1].content, /FONTE AUTORIZADA PARA A LEGENDA:\ntranscript/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sem título e sem legenda, a transcrição gera título e legenda", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Defesa Civil interdita ponte após vistoria técnica em Pilar",
      caption: "A Defesa Civil interditou a ponte após uma vistoria técnica realizada no município de Pilar.",
      sourceMode: "article_fallback",
      titleSources: ["transcript"],
      preservedFacts: ["ponte interditada em Pilar"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const generated = await generateCopy(
      {
        transcript: "A Defesa Civil interditou a ponte após uma vistoria técnica realizada no município de Pilar.",
      },
      "key",
      "model",
    );
    assert.equal(generated.sourceMode, "article_fallback");
    assert.deepEqual(generated.titleSources, ["transcript"]);
    assert.match(generated.title, /Defesa Civil/);
    assert.match(generated.caption, /município de Pilar/);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
