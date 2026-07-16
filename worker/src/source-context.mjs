const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function buildSourceContext(results) {
  const persistedSources = results.editorial_sources_loaded === true;
  const context = {
    original_title: persistedSources
      ? text(results.original_title)
      : text(results.original_title) ||
        text(results.metadata?.title) ||
        text(results.ocr?.title),
    original_caption: persistedSources
      ? text(results.original_caption)
      : text(results.original_caption) || text(results.metadata?.caption),
    clean_original_caption: persistedSources
      ? text(results.clean_original_caption)
      : text(results.clean_original_caption) ||
        text(results.original_caption) ||
        text(results.metadata?.caption),
    article_body: text(results.metadata?.articleBody),
    transcript: text(results.transcript),
    editorial_tone: text(results.editorial_tone),
    notes: text(results.notes),
  };

  if (
    !context.original_title &&
    !context.clean_original_caption &&
    !context.article_body &&
    !context.transcript
  ) {
    throw Object.assign(
      new Error("Não foi encontrado conteúdo factual na legenda, na fala ou nos textos do vídeo"),
      { code: "INSUFFICIENT_SOURCE" },
    );
  }

  return context;
}
