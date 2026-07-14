import assert from "node:assert/strict";
import test from "node:test";
import {
  formatSocialParagraphs,
  generateCopy,
  transcribeAudio,
} from "./openrouter.mjs";

test("separa legendas em parágrafos curtos para redes sociais", () => {
  assert.equal(
    formatSocialParagraphs(
      "Primeiro fato confirmado. Segundo fato confirmado. Desfecho da notícia.",
    ),
    "Primeiro fato confirmado. Segundo fato confirmado.\n\nDesfecho da notícia.",
  );
  assert.equal(
    formatSocialParagraphs("Primeiro parágrafo.\nSegundo parágrafo."),
    "Primeiro parágrafo.\n\nSegundo parágrafo.",
  );
});

test("usa o endpoint dedicado de transcrição do OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ text: "  transcrição real  " }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await transcribeAudio(
      "audio-base64",
      "test-key",
      "openai/whisper-large-v3",
    );
    const body = JSON.parse(request.options.body);
    assert.equal(
      request.url,
      "https://openrouter.ai/api/v1/audio/transcriptions",
    );
    assert.equal(body.model, "openai/whisper-large-v3");
    assert.deepEqual(body.input_audio, { data: "audio-base64", format: "mp3" });
    assert.equal(body.language, "pt");
    assert.equal(result, "transcrição real");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("propaga falha da transcrição como erro do OpenRouter", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("provider unavailable", { status: 503 });

  try {
    await assert.rejects(
      () =>
        transcribeAudio("audio-base64", "test-key", "openai/whisper-large-v3"),
      (error) => error.code === "OPENROUTER_ERROR" && /503/.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita JSON estruturalmente inválido da IA", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify({ title: "incompleto" }) } },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    await assert.rejects(
      () => generateCopy({}, "test-key", "test-model"),
      (error) => error.code === "INVALID_AI_RESPONSE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("orienta a IA a preservar os fatos de legendas extensas", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Título completo",
                caption: "Legenda completa com fatos confirmados. ".repeat(8),
                summary: "Resumo",
                category_suggestion: null,
                detected_facts: [],
                warnings: [],
                confidence: "high",
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    await generateCopy(
      { source_caption: "Legenda extensa com fatos confirmados. ".repeat(8) },
      "test-key",
      "test-model",
    );
    assert.match(request.messages[0].content, /2 a 4 parágrafos/);
    assert.match(request.messages[0].content, /todos os fatos relevantes/);
    assert.match(request.messages[0].content, /aspecto mais relevante e polêmico/);
    assert.match(request.messages[0].content, /nunca distorcer/);
    assert.ok(
      request.response_format.json_schema.schema.properties.caption.minLength >
        200,
    );
    const requirements = JSON.parse(request.messages[1].content)
      .editorial_requirements;
    assert.equal(requirements.preserve_all_relevant_source_facts, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
