export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;
export const TITLE_FONT_MIN = 42;
export const TITLE_FONT_MAX = 72;
export const TITLE_MAX_LINES = 3;

export type DesignExportFormat = "png" | "jpg";
export type DesignStatus = "draft" | "rendering" | "ready" | "failed";
export type TextAlignment = "left" | "center" | "right";
export type MediaFit = "cover" | "contain";
export type DesignFormat = "story" | "portrait" | "square";
export type DesignFontFamily = "Sora" | "Open Sans";
export type TemplateSurface = "box" | "gradient";

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
  paddingX: number;
  paddingY: number;
  maxLines: number;
  fontFamily: DesignFontFamily;
};

export type CarouselSlide = {
  id: string;
  sourceIndex: number;
  mediaAssetPath: string | null;
  mediaMimeType: string | null;
  title: string;
  category: string;
  media: MediaTransform;
  showTitle: boolean;
  showCategory: boolean;
  showBrand: boolean;
};

export type DesignConfig = {
  format: DesignFormat;
  media: MediaTransform;
  title: TitleLayout;
  showCategory: boolean;
  showBrand: boolean;
  showCredits: boolean;
  credits: string;
  slides: CarouselSlide[];
  activeSlideId: string | null;
  exportedCarouselPaths: string[];
};

export type DesignTemplateProfile = {
  format: DesignFormat;
  name: string;
  shortName: string;
  width: number;
  height: number;
  ratio: string;
  recommendedFor: string;
  surface: TemplateSurface;
  title: TitleLayout;
  titleBox: { x: number; y: number; width: number; minHeight: number; maxHeight: number };
  category: { y: number; height: number; minWidth: number; maxWidth: number; fontSize: number };
  overlayStartY: number;
};

const baseMedia: MediaTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  fit: "cover",
  currentTime: 0,
  muted: false,
};

export const DESIGN_TEMPLATES: Record<DesignFormat, DesignTemplateProfile> = {
  story: {
    format: "story",
    name: "Francês News — Story/Reel",
    shortName: "Story/Reel 9:16",
    width: 1080,
    height: 1920,
    ratio: "9:16",
    recommendedFor: "Vídeos verticais",
    surface: "box",
    title: {
      x: 42,
      y: 1390,
      width: 996,
      height: 250,
      fontSize: 64,
      lineHeight: 1.04,
      align: "center",
      paddingX: 26,
      paddingY: 20,
      maxLines: 3,
      fontFamily: "Open Sans",
    },
    titleBox: { x: 42, y: 1350, width: 996, minHeight: 220, maxHeight: 330 },
    category: { y: 1316, height: 64, minWidth: 330, maxWidth: 820, fontSize: 36 },
    overlayStartY: 1120,
  },
  portrait: {
    format: "portrait",
    name: "Francês News — Post vertical",
    shortName: "Post 4:5",
    width: 1080,
    height: 1350,
    ratio: "4:5",
    recommendedFor: "Feed e carrossel",
    surface: "gradient",
    title: {
      x: 70,
      y: 934,
      width: 940,
      height: 300,
      fontSize: 58,
      lineHeight: 1.08,
      align: "center",
      paddingX: 12,
      paddingY: 12,
      maxLines: 4,
      fontFamily: "Sora",
    },
    titleBox: { x: 70, y: 904, width: 940, minHeight: 270, maxHeight: 360 },
    category: { y: 866, height: 58, minWidth: 330, maxWidth: 760, fontSize: 34 },
    overlayStartY: 690,
  },
  square: {
    format: "square",
    name: "Francês News — Post quadrado",
    shortName: "Quadrado 1:1",
    width: 1080,
    height: 1080,
    ratio: "1:1",
    recommendedFor: "Imagens quadradas",
    surface: "gradient",
    title: {
      x: 70,
      y: 754,
      width: 940,
      height: 236,
      fontSize: 52,
      lineHeight: 1.06,
      align: "center",
      paddingX: 12,
      paddingY: 10,
      maxLines: 4,
      fontFamily: "Sora",
    },
    titleBox: { x: 70, y: 730, width: 940, minHeight: 220, maxHeight: 286 },
    category: { y: 694, height: 56, minWidth: 320, maxWidth: 740, fontSize: 32 },
    overlayStartY: 520,
  },
};

export const DEFAULT_DESIGN_CONFIG: DesignConfig = {
  format: "story",
  media: { ...baseMedia },
  title: { ...DESIGN_TEMPLATES.story.title },
  showCategory: true,
  showBrand: true,
  showCredits: false,
  credits: "",
  slides: [],
  activeSlideId: null,
  exportedCarouselPaths: [],
};

export type VideoRenderRequestV1 = {
  version: 1;
  designId: string;
  newsId: string;
  sourceMediaPath: string;
  sourceBucket: string;
  templateSlug: string;
  composition: DesignConfig & { titleText: string; categoryText: string };
  output: {
    width: number;
    height: number;
    mimeType: "video/mp4";
    keepOriginalDuration: true;
    keepOriginalAudio: true;
  };
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
  fontFamily: DesignFontFamily = "Open Sans",
) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  if (context) context.font = `700 ${fontSize}px "${fontFamily}", Arial, sans-serif`;
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const measured = context ? context.measureText(candidate).width : candidate.length * fontSize * 0.56;
    if (measured <= width || !current) current = candidate;
    else {
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
  maxFontSize = DEFAULT_DESIGN_CONFIG.title.fontSize,
  minFontSize = TITLE_FONT_MIN,
  maxHeight = Number.POSITIVE_INFINITY,
  fontFamily: DesignFontFamily = DEFAULT_DESIGN_CONFIG.title.fontFamily,
) {
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = wrapHeadline(text, width, fontSize, context, fontFamily);
    const requiredHeight = Math.ceil(lines.length * fontSize * lineHeight);
    if (lines.length <= maxLines && requiredHeight <= maxHeight)
      return { fontSize, lineCount: lines.length, fits: true, requiredHeight } satisfies FittedHeadline;
  }
  const lines = wrapHeadline(text, width, minFontSize, context, fontFamily);
  return {
    fontSize: minFontSize,
    lineCount: lines.length,
    fits: lines.length <= maxLines && lines.length * minFontSize * lineHeight <= maxHeight,
    requiredHeight: Math.ceil(lines.length * minFontSize * lineHeight),
  } satisfies FittedHeadline;
}

export function coverMedia(
  sourceWidth: number,
  sourceHeight: number,
  transform: MediaTransform,
  canvasWidth = DESIGN_WIDTH,
  canvasHeight = DESIGN_HEIGHT,
) {
  if (!sourceWidth || !sourceHeight) return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
  const baseScale = transform.fit === "contain"
    ? Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    : Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const scale = baseScale * Math.max(1, Math.min(3, transform.zoom || 1));
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const maxOffsetX = Math.max(0, (width - canvasWidth) / 2);
  const maxOffsetY = Math.max(0, (height - canvasHeight) / 2);
  const offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, transform.offsetX || 0));
  const offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, transform.offsetY || 0));
  return { x: (canvasWidth - width) / 2 + offsetX, y: (canvasHeight - height) / 2 + offsetY, width, height };
}

export function clampMediaPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth = DESIGN_WIDTH,
  canvasHeight = DESIGN_HEIGHT,
) {
  return {
    x: width <= canvasWidth ? (canvasWidth - width) / 2 : Math.min(0, Math.max(canvasWidth - width, x)),
    y: height <= canvasHeight ? (canvasHeight - height) / 2 : Math.min(0, Math.max(canvasHeight - height, y)),
  };
}

export function templateForFormat(format: DesignFormat) {
  return DESIGN_TEMPLATES[format] || DESIGN_TEMPLATES.story;
}

export function applyDesignFormat(config: DesignConfig, format: DesignFormat): DesignConfig {
  const profile = templateForFormat(format);
  return {
    ...config,
    format,
    media: { ...config.media, offsetX: 0, offsetY: 0 },
    title: { ...profile.title, fontFamily: config.title.fontFamily || profile.title.fontFamily },
    slides: config.slides.map((slide) => ({
      ...slide,
      media: { ...slide.media, offsetX: 0, offsetY: 0 },
    })),
  };
}

export function suggestDesignFormat(
  sourceWidth: number,
  sourceHeight: number,
  mediaCount = 1,
  previous?: DesignFormat | null,
): DesignFormat {
  if (mediaCount > 1) return previous && DESIGN_TEMPLATES[previous] ? previous : "portrait";
  if (!sourceWidth || !sourceHeight) return "story";
  const ratio = sourceWidth / sourceHeight;
  const candidates = (Object.values(DESIGN_TEMPLATES) as DesignTemplateProfile[]).map((template) => ({
    format: template.format,
    delta: Math.abs(Math.log(ratio / (template.width / template.height))),
  }));
  candidates.sort((a, b) => a.delta - b.delta);
  if (previous && DESIGN_TEMPLATES[previous]) {
    const remembered = candidates.find((candidate) => candidate.format === previous);
    if (remembered && remembered.delta <= candidates[0].delta + 0.12)
      return previous;
  }
  return candidates[0].format;
}

export function significantCrop(
  sourceWidth: number,
  sourceHeight: number,
  format: DesignFormat,
) {
  if (!sourceWidth || !sourceHeight) return false;
  const template = templateForFormat(format);
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = template.width / template.height;
  const visibleFraction = sourceRatio > targetRatio ? targetRatio / sourceRatio : sourceRatio / targetRatio;
  return visibleFraction < 0.72;
}

function safeFont(value: unknown, fallback: DesignFontFamily): DesignFontFamily {
  return value === "Sora" || value === "Open Sans" ? value : fallback;
}

export function mergeDesignConfig(value: unknown): DesignConfig {
  if (!value || typeof value !== "object") return structuredClone(DEFAULT_DESIGN_CONFIG);
  const input = value as Partial<DesignConfig>;
  const format = input.format && DESIGN_TEMPLATES[input.format] ? input.format : "story";
  const profile = templateForFormat(format);
  const titleInput: Partial<TitleLayout> = input.title || {};
  const legacyStoryTitle =
    format === "story" &&
    titleInput.paddingX == null &&
    Number(titleInput.width || 0) <= 876;
  return {
    ...DEFAULT_DESIGN_CONFIG,
    ...input,
    format,
    media: { ...baseMedia, ...(input.media || {}) },
    title: {
      ...profile.title,
      ...titleInput,
      ...(legacyStoryTitle
        ? { x: profile.title.x, width: profile.title.width, fontSize: profile.title.fontSize }
        : {}),
      paddingX: Number(titleInput.paddingX ?? profile.title.paddingX),
      paddingY: Number(titleInput.paddingY ?? profile.title.paddingY),
      maxLines: Number(titleInput.maxLines ?? profile.title.maxLines),
      fontFamily: safeFont(titleInput.fontFamily, profile.title.fontFamily),
    },
    slides: Array.isArray(input.slides) ? input.slides : [],
    activeSlideId: typeof input.activeSlideId === "string" ? input.activeSlideId : null,
    exportedCarouselPaths: Array.isArray(input.exportedCarouselPaths)
      ? input.exportedCarouselPaths.filter((path): path is string => typeof path === "string")
      : [],
  };
}

export function validateDesignImage(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP.";
  if (file.size > 15 * 1024 * 1024) return "A imagem deve ter no máximo 15 MB.";
  return null;
}

export function validateDesignMedia(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"];
  if (!allowed.includes(file.type)) return "Use uma imagem JPG, PNG ou WebP, ou um vídeo MP4, WebM ou MOV.";
  const limit = file.type.startsWith("video/") ? 100 : 15;
  if (file.size > limit * 1024 * 1024) return `A mídia deve ter no máximo ${limit} MB.`;
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
