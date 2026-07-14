export function shouldTranscribe(newsItem) {
  return newsItem?.transcribe_audio === true;
}

export function editorMediaType(stepResults) {
  if (stepResults?.media_kind === "image") return "image";
  if (stepResults?.media_kind === "carousel")
    return stepResults.media_items?.some((item) => item.kind === "video")
      ? "video"
      : "image";
  return "video";
}
