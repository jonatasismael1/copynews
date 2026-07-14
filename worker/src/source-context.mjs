const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function buildSourceContext(results) {
  const context = {
    source_caption: text(results.metadata?.caption),
    transcript: text(results.transcript),
    ocr_text: text(results.ocr?.text),
    editorial_tone: text(results.editorial_tone),
    notes: text(results.notes),
  };

  if (!context.source_caption && !context.transcript && !context.ocr_text) {
    throw Object.assign(
      new Error(
        "Não foi encontrado conteúdo factual na legenda, na fala ou nos textos do vídeo",
      ),
      { code: "INSUFFICIENT_SOURCE" },
    );
  }

  return context;
}
