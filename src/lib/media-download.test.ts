import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAppleMobile,
  savePreparedMedia,
  savePreparedMediaFiles,
} from "./media-download";

const originalUserAgent = Object.getOwnPropertyDescriptor(
  navigator,
  "userAgent",
);
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
const originalCanShare = Object.getOwnPropertyDescriptor(
  navigator,
  "canShare",
);

function restore(
  property: "userAgent" | "share" | "canShare",
  descriptor?: PropertyDescriptor,
) {
  if (descriptor) Object.defineProperty(navigator, property, descriptor);
  else delete (navigator as unknown as Record<string, unknown>)[property];
}

afterEach(() => {
  restore("userAgent", originalUserAgent);
  restore("share", originalShare);
  restore("canShare", originalCanShare);
});

describe("salvamento de mídia no iPhone", () => {
  it("abre a folha de compartilhamento com o vídeo como arquivo", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: canShare,
    });
    const file = new File(["video"], "copy-news.mp4", { type: "video/mp4" });

    expect(isAppleMobile()).toBe(true);
    await expect(savePreparedMedia(file)).resolves.toBe("shared");
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(share).toHaveBeenCalledWith({
      files: [file],
      title: "Salvar mídia do Copy News",
    });
  });

  it("envia todas as imagens do carrossel juntas para a galeria", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: canShare,
    });
    const files = [
      new File(["one"], "copy-news-01.jpg", { type: "image/jpeg" }),
      new File(["two"], "copy-news-02.jpg", { type: "image/jpeg" }),
    ];

    await expect(savePreparedMediaFiles(files)).resolves.toBe("shared");
    expect(canShare).toHaveBeenCalledWith({ files });
    expect(share).toHaveBeenCalledWith({
      files,
      title: "Salvar mídia do Copy News",
    });
  });
});
