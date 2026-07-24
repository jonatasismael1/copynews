export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;
export const TITLE_FONT_MIN = 30;
export const TITLE_FONT_MAX = 36;
export const TITLE_MAX_LINES = 5;

export type DesignExportFormat = "png" | "jpg";
export type DesignStatus = "draft" | "rendering" | "ready" | "failed";
export type TextAlignment = "left" | "center" | "right";
export type MediaFit = "cover" | "contain";

export type MediaTransform = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  fit: MediaFit;
  currentTime: number;
  muted: boolean;
};

export type TitleLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  align: TextAlignment;
};

export type DesignConfig = {
  media: MediaTransform;
  title: TitleLayout;
  showCategory: boolean;
  showBrand: boolean;
  showCredits: boolean;
  credits: string;
};

export type VideoRenderRequestV1 = {
  version: 1;
  designId: string;
  newsId: string;
  sourceMediaPath: string;
  sourceBucket: string;
  templateSlug: "frances-news-story-padrao";
  composition: DesignConfig & {
    titleText: string;
    categoryText: string;
  };
  output: {
    width: 1080;
    height: 1920;
    mimeType: "video/mp4";
    keepOriginalDuration: true;
    keepOriginalAudio: true;
  };
};

export const DEFAULT_DESIGN_CONFIG: DesignConfig = {
  media: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    fit: "cover",
    currentTime: 0,
    muted: false,
  },
  title: {
    x: 102,
    y: 1404,
    width: 876,
    height: 142,
    fontSize: TITLE_FONT_MAX,
    lineHeight: 1.22,
    align: "center",
  },
  showCategory: true,
  showBrand: true,
  showCredits: false,
  credits: "",
};

export type FittedHeadline = {
  fontSize: number;
  lineCount: number;
  fits: boolean;
  requiredHeight: number;
};

function canvasContext() {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas").getContext("2d");
}

export function wrapHeadline(
  text: string,
  width: number,
  fontSize: number,
  context = canvasContext(),
) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  if (context)
    context.font = `700 ${fontSize}px "Open Sans", Arial, sans-serif`;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const measured = context
      ? context.measureText(candidate).width
      : candidate.length * fontSize * 0.56;
    if (measured <= width || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function fitHeadline(
  text: string,
  width = DEFAULT_DESIGN_CONFIG.title.width,
  lineHeight = DEFAULT_DESIGN_CONFIG.title.lineHeight,
  maxLines = TITLE_MAX_LINES,
  context = canvasContext(),
) {
  for (let fontSize = TITLE_FONT_MAX; fontSize >= TITLE_FONT_MIN; fontSize -= 1) {
    const lines = wrapHeadline(text, width, fontSize, context);
    if (lines.length <= maxLines) {
      return {
        fontSize,
        lineCount: lines.length,
        fits: true,
        requiredHeight: Math.ceil(lines.length * fontSize * lineHeight),
      } satisfies FittedHeadline;
    }
  }

  const lines = wrapHeadline(text, width, TITLE_FONT_MIN, context);
  return {
    fontSize: TITLE_FONT_MIN,
    lineCount: lines.length,
    fits: false,
    requiredHeight: Math.ceil(lines.length * TITLE_FONT_MIN * lineHeight),
  } satisfies FittedHeadline;
}

export function coverMedia(
  sourceWidth: number,
  sourceHeight: number,
  transform: MediaTransform,
) {
  if (!sourceWidth || !sourceHeight)
    return {
      x: 0,
      y: 0,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
    };
  const baseScale =
    transform.fit === "contain"
      ? Math.min(DESIGN_WIDTH / sourceWidth, DESIGN_HEIGHT / sourceHeight)
      : Math.max(DESIGN_WIDTH / sourceWidth, DESIGN_HEIGHT / sourceHeight);
  const scale = baseScale * transform.zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const maxOffsetX = Math.max(0, (width - DESIGN_WIDTH) / 2);
  const maxOffsetY = Math.max(0, (height - DESIGN_HEIGHT) / 2);
  const offsetX = Math.max(
    -maxOffsetX,
    Math.min(maxOffsetX, transform.offsetX),
  );
  const offsetY = Math.max(
    -maxOffsetY,
    Math.min(maxOffsetY, transform.offsetY),
  );
  return {
    x: (DESIGN_WIDTH - width) / 2 + offsetX,
    y: (DESIGN_HEIGHT - height) / 2 + offsetY,
    width,
    height,
  };
}

export function clampMediaPosition(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    x:
      width <= DESIGN_WIDTH
        ? (DESIGN_WIDTH - width) / 2
        : Math.min(0, Math.max(DESIGN_WIDTH - width, x)),
    y:
      height <= DESIGN_HEIGHT
        ? (DESIGN_HEIGHT - height) / 2
        : Math.min(0, Math.max(DESIGN_HEIGHT - height, y)),
  };
}

export function mergeDesignConfig(value: unknown): DesignConfig {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_DESIGN_CONFIG);
  const input = value as Partial<DesignConfig>;
  return {
    ...DEFAULT_DESIGN_CONFIG,
    ...input,
    media: {
      ...DEFAULT_DESIGN_CONFIG.media,
      ...(input.media || {}),
    },
    title: {
      ...DEFAULT_DESIGN_CONFIG.title,
      ...(input.title || {}),
    },
  };
}

export function validateDesignImage(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type))
    return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > 15 * 1024 * 1024)
    return "A imagem deve ter no máximo 15 MB.";
  return null;
}

export function validateDesignMedia(file: File) {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];
  if (!allowed.includes(file.type))
    return "Use uma imagem JPG, PNG ou WebP, ou um vídeo MP4, WebM ou MOV.";
  const limit = file.type.startsWith("video/") ? 100 : 15;
  if (file.size > limit * 1024 * 1024)
    return `A mídia deve ter no máximo ${limit} MB.`;
  return null;
}

export function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "jpg";
}
