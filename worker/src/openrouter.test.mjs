import assert from "node:assert/strict";
import test from "node:test";
import { transcribeAudio } from "./openrouter.mjs";

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
