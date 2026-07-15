const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function buildSourceContext(results) {
  const context = {
    original_title: text(results.metadata?.title),
    source_caption: text(results.metadata?.caption),
    article_body: text(results.metadata?.articleBody),
    transcript: text(results.transcript),
    ocr_text: text(results.ocr?.text),
    ocr_confidence:
      typeof results.ocr?.confidence === "number" ? results.ocr.confidence : null,
    editorial_tone: text(results.editorial_tone),
    notes: text(results.notes),
  };

  if (
    !context.original_title &&
    !context.source_caption &&
    !context.article_body &&
    !context.transcript &&
    !context.ocr_text
  ) {
    throw Object.assign(
      new Error("Não foi encontrado conteúdo factual na legenda, na fala ou nos textos do vídeo"),
      { code: "INSUFFICIENT_SOURCE" },
    );
  }

  return context;
}
