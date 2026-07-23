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

const classify = (input) => classifySources(input);
const result = (sources, title, caption = sources.captionSource || title) => ({
  title,
  caption,
  sourceMode: sources.sourceMode,
  usedSources: ["originalTitle"],
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
        "Nova escola no Pontal é inaugurada nesta terça-feira pela Prefeitura de Maceió",
        "No bairro Pontal, uma nova unidade escolar foi entregue nesta terça-feira pela Prefeitura de Maceió.",
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
  assert.equal(
    cleanSourceCaption(
      "Fato principal confirmado.\n\n🔄 Acesse a matéria completa em nosso site\n\nEnvie sugestões pelo WhatsApp",
    ),
    "Fato principal confirmado.",
  );
  assert.equal(
    cleanSourceCaption(
      "Fato principal confirmado.\n\n7 Segundos\n\n🚀 Inovação em jornalismo!\n\n📲 (82) 99999-9999",
    ),
    "Fato principal confirmado.",
  );
});

test("título limpo extraído do OCR vira escrita normal e usa a legenda para explicar HGE", () => {
  const sources = classify({
    originalTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
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
  assert.deepEqual(
    validateCopy(
      result(
        sources,
        "Motorista é preso após colisão com motocicleta em Arapiraca",
        "Em Arapiraca, o motorista foi preso depois de colidir com uma motocicleta.",
      ),
      sources,
    ),
    [],
  );
});

test("ausência de título gera caption_only", () => {
  assert.equal(classify({ originalCaption: "A Câmara aprovou o projeto por unanimidade." }).sourceMode, "caption_only");
});

test("título genérico é ignorado em favor da legenda", () => {
  const sources = classify({ originalTitle: "Confira o que aconteceu", originalCaption: "Defesa Civil interdita ponte após vistoria em Pilar." });
  assert.equal(sources.originalTitle, "");
  assert.equal(sources.sourceMode, "caption_only");
});

test("título extraído ilegível não vira fato", () => {
  assert.equal(isUsableTitle("PR3F3!TUR@ ###", { ocrConfidence: 0.3 }), false);
  assert.equal(classify({ originalTitle: "PR3F3!TUR@ ###", originalCaption: "Prefeitura anuncia calendário." }).sourceMode, "caption_only");
});

test("crítica direta preserva nome e teor", () => {
  const sources = classify({ originalTitle: "Vereador João Silva critica atraso da Prefeitura de Maceió em obra pública" });
  const violations = validateCopy(result(sources, "Vereador critica atraso em obra pública"), sources);
  assert.ok(violations.some((item) => /Nome próprio removido/.test(item)));
});

test("denúncia não pode virar fato confirmado", () => {
  const sources = classify({ originalTitle: "Segundo promotora, empresa é acusada de fraude em contrato público" });
  const violations = validateCopy(result(sources, "Empresa comete fraude em contrato público"), sources);
  assert.ok(
    violations.some((item) => /Nível de certeza removido|Atribuição removida/.test(item)),
  );
});

test("contradição entre título e legenda exige manual_review sem mistura", () => {
  const sources = classify({ originalTitle: "Motociclista fica ferido após colisão em Maceió", originalCaption: "O motociclista morreu após atropelamento em Maceió." });
  assert.equal(sources.sourceMode, "manual_review");
  assert.ok(sources.contradictions.length >= 1);
});

test("título curto também precisa ser realmente reescrito", () => {
  const sources = classify({ originalTitle: "TRE rejeita pedido em Alagoas" });
  assert.ok(
    validateCopy(result(sources, sources.originalTitle), sources).some((item) =>
      /copiado literalmente/.test(item),
    ),
  );
  assert.deepEqual(
    validateCopy(result(sources, "Em Alagoas, TRE rejeita pedido"), sources),
    [],
  );
});

test("legenda curta também precisa ser realmente reescrita", () => {
  const sources = classify({
    originalTitle: "Defesa Civil interdita ponte em Pilar",
    originalCaption: "A ponte foi interditada após uma vistoria técnica.",
  });
  assert.ok(
    validateCopy(
      result(
        sources,
        "Após vistoria, Defesa Civil interdita ponte em Pilar",
        sources.originalCaption,
      ),
      sources,
    ).some((item) => /Legenda foi copiada literalmente/.test(item)),
  );
});

test("destaque aceita tema editorial ou cidade citada, mas bloqueia local inventado", () => {
  const sources = classify({
    originalTitle: "Defesa Civil interdita ponte em Penedo",
    originalCaption: "A interdição ocorreu após uma vistoria técnica.",
  });
  const base = result(
    sources,
    "Após vistoria, ponte é interditada pela Defesa Civil em Penedo",
    "Uma vistoria técnica levou a Defesa Civil a interditar a ponte em Penedo.",
  );
  assert.deepEqual(
    validateCopy(
      { ...base, highlights: ["Penedo", "Investigação", "Notícia"] },
      sources,
    ),
    [],
  );
  assert.ok(
    validateCopy(
      { ...base, highlights: ["Penedo", "Investigação", "Arapiraca"] },
      sources,
    ).some((item) => /Destaque não sustentado/.test(item)),
  );
});

test("legenda longa preserva extensão, crédito e citação direta", () => {
  const quote =
    "Infelizmente, Deus recolheu minha mãe juntamente com minha sobrinha.";
  const originalCaption = `📹 Vídeo reprodução: @weverton_franciscoo

A tragédia envolvendo a van do Tratamento Fora do Domicílio continua comovendo o Sertão de Pernambuco. Horas após o acidente que tirou a vida de sete pessoas, Weverton Francisco usou as redes sociais para falar sobre a perda da mãe e da sobrinha.

Em um vídeo emocionado, ele lamentou as mortes registradas na colisão da madrugada desta quinta-feira (23), na PE-360, entre Floresta e Ibimirim.

“${quote}”

Ele agradeceu as mensagens de apoio e pediu orações por todas as famílias atingidas. O acidente segue sendo investigado pelas autoridades competentes.`;
  const sources = classify({
    originalTitle: "Filho de vítima relata perdas após acidente com van",
    originalCaption,
  });
  const shortened = result(
    sources,
    "Filho relata dor após acidente com van no Sertão",
    "Weverton Francisco lamentou a perda da mãe e da sobrinha após o acidente. Sete pessoas morreram.",
  );
  const violations = validateCopy(shortened, sources).join(" ");

  assert.match(violations, /curta demais/i);
  assert.match(violations, /@weverton_franciscoo/i);
  assert.match(violations, /Citação direta removida/i);
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
  const faithfulCaption = "No bairro Graciliano Ramos, em Palmeira dos Índios, um motorista sob forte efeito de bebidas alcoólicas colidiu contra uma motocicleta e deixou 2 pessoas feridas.";
  assert.deepEqual(validateCopy(result(sources, allowed, faithfulCaption), sources), []);
  for (const invented of ["atropelamento", "morte", "fuga", "hospitalização", "10º Batalhão", "delegado José"])
    assert.ok(validateCopy(result(sources, `${allowed} ${invented}`), sources).length > 0, invented);
});

test("fallback de revisão manual também nunca ultrapassa 150 caracteres", async () => {
  const generated = await generateCopy(
    {
      original_title: `Motociclista fica ferido após colisão ${"em trecho da rodovia estadual ".repeat(6)}`,
      clean_original_caption: "O motociclista morreu após atropelamento no mesmo local.",
    },
    "unused",
    "unused",
  );
  assert.equal(generated.sourceMode, "manual_review");
  assert.ok(generated.title.length <= 150);
});

test("rejeita a notícia inventada sobre São Gonçalo, Covid e ocupação de UTI", () => {
  const sources = classify({
    originalTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
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
    originalTitle: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
    originalCaption: "A Vigilância Sanitária de Maceió encontrou irregularidades graves durante fiscalização no Hospital Geral do Estado (HGE) e notificou o hospital.",
  });
  const edited = result(
    sources,
    "Vigilância Sanitária encontra irregularidades graves no HGE durante fiscalização e notifica hospital",
    "Durante uma fiscalização no Hospital Geral do Estado (HGE), a Vigilância Sanitária de Maceió encontrou irregularidades graves e notificou o hospital.",
  );
  assert.equal(
    cleanSourceCaption(
      "Fato principal confirmado pela fiscalização.\n\nContato\n\n(82) 99999-9999\n\n#notícias",
    ),
    "Fato principal confirmado pela fiscalização.",
  );
  edited.sourceMode = "title_plus_caption";
  edited.usedSources = ["originalTitle", "originalCaption"];
  assert.deepEqual(validateCopy(edited, sources), []);
  assert.ok(edited.title.length <= 150);
});

test("article_fallback usa somente conteúdo extraído do link", () => {
  const article = classify({ articleBody: "O corpo da matéria informa a decisão judicial." });
  assert.equal(article.sourceMode, "article_fallback");
  assert.equal(article.supplementalKind, "articleBody");
  assert.equal(classify({ originalCaption: "Veja mais", articleBody: "O corpo da matéria informa a decisão judicial." }).sourceMode, "article_fallback");
});

test("título incompleto sem legenda usa a transcrição como apoio", () => {
  const sources = classify({
    originalTitle: "Prefeitura anuncia medidas após",
    transcript: "A Prefeitura anunciou medidas após a vistoria técnica na ponte do Centro.",
  });
  assert.equal(sources.sourceMode, "article_fallback");
  assert.deepEqual(
    validateCopy(
      {
        title: "Após vistoria técnica, Prefeitura anuncia medidas para a ponte do Centro",
        caption: "A Prefeitura anunciou medidas para a ponte do Centro depois de realizar uma vistoria técnica.",
        sourceMode: "article_fallback",
        usedSources: ["originalTitle", "transcription"],
        warnings: [],
      },
      sources,
    ),
    [],
  );
});

test("título do OCR usa a transcrição para gerar a legenda quando não há legenda original", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Após vistoria técnica, Prefeitura anuncia reforma da ponte",
      caption: "A Prefeitura anunciou a reforma da ponte após uma vistoria técnica realizada nesta quarta-feira.",
      sourceMode: "title_only",
      usedSources: ["originalTitle", "transcription"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const generated = await generateCopy(
      {
        original_title: "PREFEITURA ANUNCIA REFORMA DA PONTE APÓS VISTORIA TÉCNICA",
        transcript: "A Prefeitura anunciou a reforma da ponte após uma vistoria técnica realizada nesta quarta-feira.",
      },
      "key",
      "model",
    );
    assert.equal(generated.sourceMode, "title_only");
    assert.match(generated.caption, /vistoria técnica realizada nesta quarta-feira/);
    assert.match(request.messages[1].content, /FONTE PRINCIPAL DA LEGENDA:\ntranscription/);
    assert.doesNotMatch(request.messages[1].content, /OCR BRUTO/);
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
      usedSources: ["transcription"],
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
    assert.deepEqual(generated.usedSources, ["transcription"]);
    assert.match(generated.title, /Defesa Civil/);
    assert.match(generated.caption, /município de Pilar/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("não usa a legenda original bruta quando a versão limpa está ausente", async () => {
  await assert.rejects(
    () =>
      generateCopy(
        { original_caption: "WhatsApp (82) 99999-9999" },
        "unused",
        "unused",
      ),
    (error) => error.code === "INSUFFICIENT_SOURCE",
  );
  assert.equal(
    cleanSourceCaption(
      "O Corpo de Bombeiros constatou o óbito no local.\n\nA Rádio Papacaça esteve no local realizando toda a cobertura com os repórteres Alves França e André Neto.",
    ),
    "O Corpo de Bombeiros constatou o óbito no local.",
  );
});

test("aceita atribuição equivalente sem devolver a legenda original", () => {
  const sources = classify({
    originalTitle: "Homem passa mal e morre após cair na rua em Bom Conselho",
    originalCaption:
      "Um homem de 46 anos foi encontrado caído em Bom Conselho. Segundo populares, ele caiu ao tentar se levantar. De acordo com a irmã da vítima, ele se recuperava de uma cirurgia realizada há cerca de 30 dias. O Corpo de Bombeiros constatou o óbito.",
  });
  const generated = {
    title: "Homem morre após cair na rua em Bom Conselho",
    caption:
      "Um homem de 46 anos foi encontrado caído em Bom Conselho. Segundo populares, a queda ocorreu quando ele tentou se levantar. A irmã da vítima informou que ele se recuperava de uma cirurgia feita há cerca de 30 dias. O Corpo de Bombeiros constatou o óbito.",
    sourceMode: sources.sourceMode,
    usedSources: ["originalTitle", "originalCaption"],
    warnings: [],
  };
  assert.deepEqual(validateCopy(generated, sources), []);
});

test("preserva capitalização de nomes institucionais identificados na legenda", () => {
  assert.equal(
    normalizeHeadlineCase(
      "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FISCALIZAÇÃO",
      "A Vigilância Sanitária de Maceió realizou fiscalização no HGE.",
    ),
    "Vigilância Sanitária notifica HGE após fiscalização",
  );
});

test("corrige somente a legenda, preserva o título aprovado e recupera datas omitidas", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    calls += 1;
    const content = calls === 1
      ? {
          title: "Vigilância Sanitária encontra irregularidades no HGE durante fiscalização",
          caption: "A Vigilância Sanitária de Maceió encontrou irregularidades durante fiscalização no HGE.",
          sourceMode: "title_plus_caption",
          usedSources: ["originalTitle", "originalCaption"],
          warnings: [],
        }
      : {
          title: "Vigilância Sanitária encontra irregularidades no HGE durante fiscalização",
          caption: "Irregularidades foram encontradas no HGE durante fiscalização realizada na quinta-feira (9) e na sexta-feira (10), segundo informou a Vigilância Sanitária de Maceió na quarta-feira (15).",
          sourceMode: "title_plus_caption",
          usedSources: ["originalTitle", "originalCaption"],
          warnings: [],
        };
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const generated = await generateCopy(
      {
        original_title: "VIGILÂNCIA SANITÁRIA NOTIFICA HGE APÓS FLAGRAR IRREGULARIDADES EM FISCALIZAÇÃO",
        clean_original_caption:
          "Na quarta-feira (15), a Vigilância Sanitária de Maceió informou que encontrou irregularidades durante fiscalização realizada no HGE na quinta-feira (9) e na sexta-feira (10).",
      },
      "key",
      "model",
    );
    assert.equal(calls, 2);
    assert.equal(
      generated.title,
      "Vigilância Sanitária encontra irregularidades no HGE durante fiscalização",
    );
    assert.match(generated.caption, /\(15\)/);
    assert.match(generated.caption, /\(9\)/);
    assert.match(generated.caption, /\(10\)/);
    assert.match(
      requests[1].messages[1].content,
      /TÍTULO APROVADO E BLOQUEADO/,
    );
    assert.match(
      requests[1].messages[1].content,
      /deve conter literalmente estes números\/datas: 15, 9, 10/,
    );
    assert.notEqual(generated.sourceMode, "manual_review");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita mês acrescentado quando a fonte informa apenas os dias", () => {
  const sources = classify({
    originalCaption:
      "A fiscalização ocorreu na quinta-feira (9) e na sexta-feira (10).",
  });
  const violations = validateCopy(
    result(
      sources,
      "Fiscalização encontra irregularidades em hospital",
      "A fiscalização ocorreu nos dias 9 e 10 de março.",
    ),
    sources,
  );
  assert.ok(
    violations.some((item) => /Referência temporal nova na legenda: março/.test(item)),
  );
});

test("remove mês inventado da resposta sem descartar a legenda melhorada", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Fiscalização encontra irregularidades em hospital nos dias 9 e 10",
      caption: "A fiscalização encontrou irregularidades no hospital nos dias 9 e 10 de março.",
      sourceMode: "caption_only",
      usedSources: ["originalCaption"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  try {
    const generated = await generateCopy(
      {
        clean_original_caption:
          "Nos dias 9 e 10, uma fiscalização encontrou irregularidades no hospital.",
      },
      "key",
      "model",
    );
    assert.doesNotMatch(generated.caption, /março/i);
    assert.match(generated.caption, /dias 9 e 10/);
    assert.notEqual(generated.sourceMode, "manual_review");
    assert.ok(
      generated.warnings.some((item) =>
        /Referência temporal não sustentada removida: março/.test(item),
      ),
    );
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
      caption: "Após uma vistoria, a Defesa Civil decidiu interditar a ponte em Pilar.",
      sourceMode: "caption_only",
      usedSources: ["originalCaption"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await generateCopy({ clean_original_caption: "Defesa Civil interdita ponte após vistoria em Pilar." }, "key", "model");
    assert.equal(request.temperature, 0);
    assert.equal(request.top_p, 1);
    assert.equal(request.stream, false);
    assert.equal(request.provider.require_parameters, true);
    assert.equal(request.frequency_penalty, undefined);
    assert.equal(request.presence_penalty, undefined);
    assert.equal(request.reasoning, undefined);
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.response_format.json_schema.schema.additionalProperties, false);
    assert.deepEqual(
      Object.keys(request.response_format.json_schema.schema.properties).sort(),
      [
        "caption",
        "category_suggestion",
        "editorial_tone",
        "highlights",
        "sourceMode",
        "title",
        "usedSources",
        "warnings",
      ],
    );
    assert.match(request.messages[0].content, /Nunca use OCR bruto/);
    assert.match(request.messages[1].content, /TÍTULO ORIGINAL:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usa controles compatíveis com GPT-5.6 no OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Após vistoria, Defesa Civil interdita ponte em Pilar",
      caption: "Uma vistoria levou a Defesa Civil a interditar a ponte localizada em Pilar.",
      highlights: ["Pilar", "Interdição", "Notícia"],
      sourceMode: "caption_only",
      usedSources: ["originalCaption"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await generateCopy(
      {
        clean_original_caption:
          "Defesa Civil interdita ponte após vistoria em Pilar.",
      },
      "key",
      "openai/gpt-5.6-terra",
    );
    assert.equal(request.temperature, undefined);
    assert.equal(request.top_p, undefined);
    assert.deepEqual(request.reasoning, { effort: "medium" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("conclui sem bloquear quando três tentativas de reescrita falham", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      title: "Motorista causa atropelamento e morre após fuga",
      caption: "Motorista causa atropelamento e morre após fuga.",
      sourceMode: "title_only",
      usedSources: ["originalTitle"],
      warnings: [],
    }) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const originalTitle = "Motorista é preso após colisão e deixa ferido em Maceió";
    const result = await generateCopy(
      { original_title: originalTitle },
      "key",
      "model",
    );
    assert.equal(result.sourceMode, "manual_review");
    assert.equal(result.title, originalTitle);
    assert.match(result.warnings.join(" "), /concluído sem bloqueio/i);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("entrega a legenda para leitura mesmo quando o título continua igual", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const originalTitle = "Retorno de secretário da Saúde reacende debate em Alagoas";
  const originalCaption =
    "O retorno do secretário da Saúde voltou a gerar repercussão entre a população de Alagoas.";
  const rewrittenCaption =
    "Em Alagoas, a volta do secretário da Saúde ao cargo provocou nova repercussão entre os moradores.";
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        title: originalTitle,
        caption: rewrittenCaption,
        sourceMode: "title_plus_caption",
        usedSources: ["originalTitle", "originalCaption"],
        warnings: [],
      }) } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await generateCopy(
      {
        original_title: originalTitle,
        clean_original_caption: originalCaption,
      },
      "key",
      "model",
    );
    assert.equal(result.title, originalTitle);
    assert.equal(result.caption, rewrittenCaption);
    assert.match(result.warnings.join(" "), /entregue sem bloqueio/i);
    assert.equal(calls, 3);
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
