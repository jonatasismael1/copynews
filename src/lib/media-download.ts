const mimeExtensions: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function prepareMediaFile(url: string, basename = "copy-news") {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao preparar mídia (${response.status})`);
  const blob = await response.blob();
  const mime = blob.type.split(";")[0] || "video/mp4";
  const extension = mimeExtensions[mime] || "mp4";
  return new File([blob], `${basename}.${extension}`, { type: mime });
}

export async function savePreparedMedia(file: File, sourceUrl?: string) {
  if (
    isAppleMobile() &&
    navigator.share &&
    (!navigator.canShare || navigator.canShare({ files: [file] }))
  ) {
    await navigator.share({
      files: [file],
      title: "Salvar mídia do Copy News",
    });
    return "shared" as const;
  }

  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  if (!file.size && sourceUrl) window.open(sourceUrl, "_blank", "noopener");
  return "downloaded" as const;
}
