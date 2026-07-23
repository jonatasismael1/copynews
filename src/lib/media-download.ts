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

export async function prepareMediaFiles(
  urls: string[],
  basename = "copy-news",
) {
  return Promise.all(
    urls.map((url, index) =>
      prepareMediaFile(
        url,
        urls.length > 1
          ? `${basename}-${String(index + 1).padStart(2, "0")}`
          : basename,
      ),
    ),
  );
}

export async function savePreparedMediaFiles(
  files: File[],
  sourceUrls: string[] = [],
) {
  if (!files.length) throw new Error("Nenhuma mídia disponível");
  if (
    isAppleMobile() &&
    navigator.share &&
    (!navigator.canShare || navigator.canShare({ files }))
  ) {
    await navigator.share({
      files,
      title: "Salvar mídia do Copy News",
    });
    return "shared" as const;
  }

  files.forEach((file, index) => {
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    anchor.rel = "noopener";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    if (!file.size && sourceUrls[index])
      window.open(sourceUrls[index], "_blank", "noopener");
  });
  return "downloaded" as const;
}

export async function savePreparedMedia(file: File, sourceUrl?: string) {
  return savePreparedMediaFiles([file], sourceUrl ? [sourceUrl] : []);
}
