import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  FileText,
  Download,
  GalleryVerticalEnd,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  GripVertical,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Move,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Save,
  Scissors,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
  Trash2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import Konva from "konva";
import {
  Group,
  Image as KonvaImage,
  Layer,
  Rect,
  Stage,
  Text as KonvaText,
} from "react-konva";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-700.css";
import "@fontsource/sora/latin-400.css";
import "@fontsource/sora/latin-700.css";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  useDesignTemplates,
  useNewsDesign,
  useNewsItem,
} from "@/hooks/use-data";
import {
  DEFAULT_DESIGN_CONFIG,
  DESIGN_TEMPLATES,
  TITLE_FONT_MAX,
  TITLE_FONT_MIN,
  applyDesignFormat,
  clampMediaPosition,
  coverMedia,
  extensionForMime,
  fitHeadline,
  mergeDesignConfig,
  pinchZoom,
  significantCrop,
  suggestDesignFormat,
  templateForFormat,
  titleColorForSurface,
  validateDesignMedia,
  type DesignConfig,
  type DesignExportFormat,
  type DesignFontFamily,
  type DesignFormat,
  type CarouselSlide,
  type TextAlignment,
} from "@/lib/news-design";
import {
  prepareMediaFile,
  prepareMediaFiles,
  savePreparedMedia,
  savePreparedMediaFiles,
} from "@/lib/media-download";
import { supabase } from "@/lib/supabase";
import { uploadStorageFile } from "@/lib/storage-upload";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type EditorTab =
  | "modelo"
  | "midia"
  | "titulo"
  | "categoria"
  | "marca"
  | "exportar";
type SelectedLayer = "media" | "title" | "category" | null;

type MediaElement = HTMLImageElement | HTMLVideoElement;
type MediaLoadError = {
  code:
    | "MEDIA_URL_MISSING"
    | "MEDIA_UNSUPPORTED"
    | "MEDIA_UNAVAILABLE"
    | "MEDIA_CORS"
    | "MEDIA_PROCESSING";
  message: string;
};

type PrepareMediaErrorBody = {
  error?: string;
  code?: string;
};

function friendlyPrepareMediaError(code?: string): MediaLoadError {
  if (code === "MEDIA_URL_MISSING" || code === "SOURCE_UNAVAILABLE") {
    return {
      code: code === "MEDIA_URL_MISSING" ? "MEDIA_URL_MISSING" : "MEDIA_UNAVAILABLE",
      message:
        "A mídia original não está mais disponível. Escolha o arquivo na galeria para continuar.",
    };
  }
  if (code === "UNSUPPORTED_FORMAT") {
    return {
      code: "MEDIA_UNSUPPORTED",
      message:
        "Esse formato não abriu no editor. Escolha uma imagem ou vídeo compatível na galeria.",
    };
  }
  return {
    code: "MEDIA_PROCESSING",
    message:
      "Não conseguimos carregar a mídia automaticamente. Tente novamente ou escolha o arquivo na galeria.",
  };
}

async function prepareMediaError(
  error: unknown,
  data: unknown,
): Promise<MediaLoadError> {
  let detail = data as PrepareMediaErrorBody | null;
  try {
    const context = (error as { context?: Response } | null)?.context;
    if (context) detail = await context.clone().json();
  } catch {
    // A resposta genérica do SDK não deve aparecer para o usuário.
  }
  return friendlyPrepareMediaError(detail?.code);
}

function formatMediaTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const tabs: { id: EditorTab; label: string; icon: LucideIcon }[] = [
  { id: "modelo", label: "Modelo", icon: GalleryVerticalEnd },
  { id: "midia", label: "Mídia", icon: Play },
  { id: "titulo", label: "Título", icon: FileText },
  { id: "categoria", label: "Categoria", icon: Palette },
  { id: "marca", label: "Marca", icon: ImagePlus },
  { id: "exportar", label: "Exportar", icon: Download },
];

function useLoadedMedia(
  url: string,
  mimeType?: string | null,
  retryVersion = 0,
  initialTime = 0,
  initialMuted = false,
) {
  const [loaded, setLoaded] = useState<{
    url: string;
    element: MediaElement;
  } | null>(null);
  const [error, setError] = useState<{
    url: string;
    detail: MediaLoadError;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isVideo =
    mimeType?.startsWith("video/") ||
    /\.(mp4|mov|webm)(?:\?|$)/i.test(url);

  useEffect(() => {
    if (!url) return;
    if (isVideo) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.playsInline = true;
      video.muted = initialMuted;
      video.oncanplay = () => {
        if (initialTime > 0 && Math.abs(video.currentTime - initialTime) > 0.25)
          video.currentTime = Math.min(
            initialTime,
            Math.max(0, video.duration - 0.05),
          );
        videoRef.current = video;
        setLoaded({ url, element: video });
      };
      video.onerror = () => {
        const unsupported = video.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED;
        setError({
          url,
          detail: {
            code: unsupported ? "MEDIA_UNSUPPORTED" : "MEDIA_UNAVAILABLE",
            message: unsupported
              ? "O navegador não consegue reproduzir este formato de vídeo."
              : "O vídeo está inacessível ou ainda está sendo processado.",
          },
        });
      };
      video.src = url;
      video.load();
      return () => {
        video.pause();
        if (videoRef.current === video) videoRef.current = null;
        video.oncanplay = null;
        video.onerror = null;
        video.removeAttribute("src");
        video.load();
      };
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setLoaded({ url, element: image });
    image.onerror = () =>
      setError({
        url,
        detail: {
          code: "MEDIA_CORS",
          message:
            "A imagem não pôde ser aberta. O arquivo pode estar inacessível ou bloqueado.",
        },
      });
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
    // Initial playback settings are restored when a new source is created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, retryVersion, url]);

  return {
    element: loaded?.url === url ? loaded.element : null,
    error: error?.url === url ? error.detail : null,
    loading: Boolean(url) && loaded?.url !== url && error?.url !== url,
    isVideo,
    videoControls: {
      togglePlayback: async () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) await video.play();
        else video.pause();
      },
      seek: (time: number) => {
        if (videoRef.current) videoRef.current.currentTime = time;
      },
      setMuted: (muted: boolean) => {
        if (videoRef.current) videoRef.current.muted = muted;
      },
    },
  };
}

function mediaDimensions(element: MediaElement | null) {
  if (!element) return { width: 0, height: 0 };
  if (element instanceof HTMLVideoElement)
    return { width: element.videoWidth, height: element.videoHeight };
  return {
    width: element.naturalWidth,
    height: element.naturalHeight,
  };
}

async function canvasBlob(
  stage: Konva.Stage,
  scale: number,
  format: DesignExportFormat,
  quality = 0.92,
): Promise<Blob> {
  await document.fonts.ready;
  stage.draw();
  const blob = (await stage.toBlob({
    pixelRatio: 1 / scale,
    mimeType: format === "png" ? "image/png" : "image/jpeg",
    quality,
  })) as Blob | null;
  if (!blob) throw new Error("Não foi possível renderizar a arte.");
  return blob;
}

function loadCanvasImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar uma página do carrossel."));
    image.src = url;
  });
}

async function renderCarouselSlide(
  imageUrl: string,
  slide: CarouselSlide,
  config: DesignConfig,
  format: DesignFormat,
  fileFormat: DesignExportFormat,
) {
  await document.fonts.ready;
  const profile = templateForFormat(format);
  const [image, brand] = await Promise.all([
    loadCanvasImage(imageUrl),
    slide.showBrand ? loadCanvasImage("/brand/frances-news-vertical.png") : Promise.resolve(null),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = profile.width;
  canvas.height = profile.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("O navegador não conseguiu preparar a exportação.");
  context.fillStyle = "#111111";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const frame = coverMedia(image.naturalWidth, image.naturalHeight, slide.media, canvas.width, canvas.height);
  context.drawImage(image, frame.x, frame.y, frame.width, frame.height);
  if (profile.surface === "gradient" || config.showMediaShade) {
    const gradient = context.createLinearGradient(0, profile.overlayStartY, 0, canvas.height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.42, profile.surface === "gradient" ? "rgba(0,0,0,.62)" : "rgba(0,0,0,.18)");
    gradient.addColorStop(1, profile.surface === "gradient" ? "rgba(0,0,0,.92)" : "rgba(0,0,0,.46)");
    context.fillStyle = gradient;
    context.fillRect(0, profile.overlayStartY, canvas.width, canvas.height - profile.overlayStartY);
  }
  if (brand) {
    context.drawImage(
      brand,
      930,
      110,
      90,
      610,
      930,
      Math.round(canvas.height * 0.057),
      90,
      Math.min(610, Math.round(canvas.height * 0.45)),
    );
  }
  const titleConfig = { ...profile.title, ...config.title };
  const fitted = fitHeadline(
    slide.title,
    titleConfig.width - titleConfig.paddingX * 2,
    titleConfig.lineHeight,
    titleConfig.maxLines,
    context,
    titleConfig.fontSize,
    Math.min(TITLE_FONT_MIN, titleConfig.fontSize),
    titleConfig.height - titleConfig.paddingY * 2,
    titleConfig.fontFamily,
  );
  const lines = slide.title.trim() ? slide.title.trim().split(/\s+/) : [];
  const wrapped: string[] = [];
  let current = "";
  context.font = `700 ${fitted.fontSize}px "${titleConfig.fontFamily}", Arial, sans-serif`;
  for (const word of lines) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= titleConfig.width - titleConfig.paddingX * 2 || !current) current = candidate;
    else { wrapped.push(current); current = word; }
  }
  if (current) wrapped.push(current);
  const titleHeight = Math.max(profile.titleBox.minHeight, Math.min(profile.titleBox.maxHeight, fitted.requiredHeight + titleConfig.paddingY * 2));
  const titleBottom = profile.titleBox.y + profile.titleBox.minHeight;
  const titleY = titleBottom - titleHeight;
  if (slide.showTitle) {
    if (profile.surface === "box") {
      context.fillStyle = "#ffffff";
      context.fillRect(profile.titleBox.x, titleY, profile.titleBox.width, titleHeight);
      const stripe = context.createLinearGradient(profile.titleBox.x, 0, profile.titleBox.x + profile.titleBox.width, 0);
      stripe.addColorStop(0, "#fb0039");
      stripe.addColorStop(1, "#d20836");
      context.fillStyle = stripe;
      context.fillRect(profile.titleBox.x + 20, titleBottom - 2, profile.titleBox.width - 40, 15);
    }
    context.fillStyle = titleColorForSurface(profile.surface);
    context.textAlign = titleConfig.align;
    context.textBaseline = "middle";
    const contentX = titleConfig.x + titleConfig.paddingX;
    const contentWidth = titleConfig.width - titleConfig.paddingX * 2;
    const textX = titleConfig.align === "left"
      ? contentX
      : titleConfig.align === "right"
        ? contentX + contentWidth
        : contentX + contentWidth / 2;
    const lineHeight = fitted.fontSize * titleConfig.lineHeight;
    const textCenter = titleY + titleHeight / 2;
    wrapped.forEach((line, index) => context.fillText(line, textX, textCenter + (index - (wrapped.length - 1) / 2) * lineHeight));
  }
  if (slide.showCategory && slide.category.trim()) {
    const category = slide.category.toLocaleUpperCase("pt-BR");
    context.font = `700 ${profile.category.fontSize}px "${titleConfig.fontFamily}", Arial, sans-serif`;
    const width = Math.min(profile.category.maxWidth, Math.max(profile.category.minWidth, context.measureText(category).width + 92));
    const x = (canvas.width - width) / 2;
    const y = titleY - profile.category.height / 2;
    const pill = context.createLinearGradient(x, 0, x + width, 0);
    pill.addColorStop(0, "#fb0039");
    pill.addColorStop(1, "#d20836");
    context.fillStyle = pill;
    context.beginPath();
    context.roundRect(x, y, width, profile.category.height, profile.category.height / 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.fillText(category, canvas.width / 2, y + profile.category.height / 2);
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Falha ao gerar uma página do carrossel.")),
      fileFormat === "png" ? "image/png" : "image/jpeg",
      0.92,
    ),
  );
}

export function NewsDesignPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: news, isLoading: newsLoading } = useNewsItem(id);
  const {
    data: savedDesign,
    isLoading: designLoading,
    refetch: refetchDesign,
  } = useNewsDesign(id);
  const { data: templates, isLoading: templateLoading } = useDesignTemplates();
  const [tab, setTab] = useState<EditorTab>("modelo");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [config, setConfig] = useState<DesignConfig>(DEFAULT_DESIGN_CONFIG);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [preparedMediaPath, setPreparedMediaPath] = useState<string | null>(
    null,
  );
  const [mediaRetryVersion, setMediaRetryVersion] = useState(0);
  const [sourceError, setSourceError] = useState<MediaLoadError | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [lastError, setLastError] = useState("");
  const [lastFailedAction, setLastFailedAction] = useState<
    "save" | "export" | null
  >(null);
  const [format, setFormat] = useState<DesignExportFormat>("png");
  const [previewScale, setPreviewScale] = useState(0.32);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedLayer, setSelectedLayer] = useState<SelectedLayer>(null);
  const [formatSuggested, setFormatSuggested] = useState(false);
  const [draggedSlideIndex, setDraggedSlideIndex] = useState<number | null>(null);
  const [templateFilter, setTemplateFilter] = useState<"all" | "story" | "post" | "carousel">("all");
  const [slidePreviewUrls, setSlidePreviewUrls] = useState<Record<string, string>>({});
  const [fontReadyVersion, setFontReadyVersion] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const mediaLayerRef = useRef<Konva.Layer>(null);
  const overlayLayerRef = useRef<Konva.Layer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const sheetTouchStart = useRef<number | null>(null);
  const carouselPreparedRef = useRef(false);

  const templateProfile = templateForFormat(config.format);
  const canvasWidth = templateProfile.width;
  const canvasHeight = templateProfile.height;
  const template =
    templates?.find((item) => item.format === config.format) ||
    templates?.find((item) => item.is_default) ||
    templates?.[0];
  const mediaCount = Math.max(
    1,
    news?.temporary_media_paths?.length ||
      (news?.temporary_media_path ? 1 : 0),
    config.slides.length,
  );
  const activeSlide = config.slides[activeSlideIndex] || null;
  const activeShowTitle = activeSlide?.showTitle ?? true;

  const {
    element: mediaElement,
    error: mediaError,
    loading: mediaLoading,
    isVideo,
    videoControls,
  } = useLoadedMedia(
    mediaUrl,
    mediaMime,
    mediaRetryVersion,
    config.media.currentTime,
    config.media.muted,
  );
  const { element: brandImage } = useLoadedMedia(
    "/brand/frances-news-vertical.png",
    "image/png",
  );
  const dimensions = mediaDimensions(mediaElement);
  const fitted = useMemo(
    () => {
      // Recalculate measurements after the bundled Open Sans files load.
      void fontReadyVersion;
      return fitHeadline(
        title,
        config.title.width - config.title.paddingX * 2,
        config.title.lineHeight,
        config.title.maxLines,
        undefined,
        config.title.fontSize,
        Math.min(TITLE_FONT_MIN, config.title.fontSize),
        config.title.height - config.title.paddingY * 2,
        config.title.fontFamily,
      );
    },
    [config.title, fontReadyVersion, title],
  );
  const effectiveFontSize = fitted.fontSize;
  const titleBoxHeight = Math.min(
    templateProfile.titleBox.maxHeight,
    Math.max(
      templateProfile.titleBox.minHeight,
      fitted.requiredHeight + config.title.paddingY * 2,
    ),
  );
  const titleBottom =
    templateProfile.titleBox.y + templateProfile.titleBox.minHeight +
    (config.title.y - templateProfile.title.y);
  const titleBoxY = titleBottom - titleBoxHeight;
  const titleBoxX = Math.max(24, config.title.x);
  const titleBoxWidth = Math.min(
    canvasWidth - 48,
    config.title.width,
  );
  const titleTextX = titleBoxX + config.title.paddingX;
  const titleTextWidth = titleBoxWidth - config.title.paddingX * 2;
  const titleTextY = titleBoxY + config.title.paddingY;
  const titleTextHeight = titleBoxHeight - config.title.paddingY * 2;
  const categoryY = titleBoxY - templateProfile.category.height / 2;
  const categoryWidth = Math.min(
    templateProfile.category.maxWidth,
    Math.max(
      templateProfile.category.minWidth,
      category.trim().length * templateProfile.category.fontSize * 0.62 + 92,
    ),
  );
  const categoryX = (canvasWidth - categoryWidth) / 2;
  const mediaRect = coverMedia(
    dimensions.width,
    dimensions.height,
    config.media,
    canvasWidth,
    canvasHeight,
  );
  const videoTrimStart = Math.min(
    Math.max(0, config.media.trimStart || 0),
    Math.max(0, videoDuration - 0.1),
  );
  const videoTrimEnd = Math.max(
    videoTrimStart + 0.1,
    Math.min(
      videoDuration || videoTrimStart + 0.1,
      config.media.trimEnd == null ? videoDuration : config.media.trimEnd,
    ),
  );
  const videoTrimDuration = Math.max(0, videoTrimEnd - videoTrimStart);

  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontReadyVersion(1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized || formatSuggested || !dimensions.width || !dimensions.height)
      return;
    const suggested = suggestDesignFormat(
      dimensions.width,
      dimensions.height,
      mediaCount,
      savedDesign
        ? config.format
        : (localStorage.getItem("copy-news-last-design-format") as DesignFormat | null),
    );
    const frame = requestAnimationFrame(() => {
      setConfig((current) => {
        const next = current.format === suggested
          ? current
          : applyDesignFormat(current, suggested);
        return {
          ...next,
          title: {
            ...next.title,
            fontFamily: savedDesign
              ? next.title.fontFamily
              : isVideo
                ? "Open Sans"
                : templateForFormat(suggested).title.fontFamily,
          },
        };
      });
      setFormatSuggested(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    config.format,
    dimensions.height,
    dimensions.width,
    formatSuggested,
    initialized,
    isVideo,
    mediaCount,
    savedDesign,
  ]);

  useEffect(() => {
    if (!previewRef.current) return;
    const update = () => {
      const element = previewRef.current;
      if (!element) return;
      const availableWidth = Math.max(1, element.clientWidth - 8);
      const availableHeight = Math.max(1, element.clientHeight - 8);
      setPreviewScale(
        Math.min(
          0.46,
          availableWidth / canvasWidth,
          availableHeight / canvasHeight,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [canvasHeight, canvasWidth, designLoading, newsLoading, templateLoading]);

  useEffect(() => {
    if (!(mediaElement instanceof HTMLVideoElement) || !mediaLayerRef.current)
      return;
    const animation = new Konva.Animation(
      () => undefined,
      mediaLayerRef.current,
    );
    const video = mediaElement;
    const draw = () => mediaLayerRef.current?.batchDraw();
    const handlePlay = () => {
      setVideoPlaying(true);
      animation.start();
    };
    const handlePause = () => {
      setVideoPlaying(false);
      animation.stop();
      draw();
    };
    const handleTime = () => {
      if (video.currentTime >= videoTrimEnd - 0.02 && !video.paused) {
        video.pause();
        video.currentTime = videoTrimStart;
      }
      setVideoCurrentTime(video.currentTime);
    };
    const handleDuration = () => setVideoDuration(video.duration || 0);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTime);
    video.addEventListener("durationchange", handleDuration);
    video.addEventListener("seeked", draw);
    handleDuration();
    draw();
    return () => {
      animation.stop();
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTime);
      video.removeEventListener("durationchange", handleDuration);
      video.removeEventListener("seeked", draw);
    };
  }, [mediaElement, videoTrimEnd, videoTrimStart]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable=true]")) return;
      if (event.key === "Escape") {
        setSelectedLayer(null);
        return;
      }
      if (selectedLayer !== "media") return;
      const movement: Record<string, [number, number]> = {
        ArrowLeft: [-12, 0],
        ArrowRight: [12, 0],
        ArrowUp: [0, -12],
        ArrowDown: [0, 12],
      };
      if (movement[event.key]) {
        event.preventDefault();
        const [x, y] = movement[event.key];
        setConfig((current) => ({
          ...current,
          media: {
            ...current.media,
            offsetX: current.media.offsetX + x,
            offsetY: current.media.offsetY + y,
          },
        }));
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setConfig((current) => ({
          ...current,
          media: {
            ...current.media,
            zoom: Math.min(3, current.media.zoom + 0.1),
          },
        }));
      } else if (event.key === "-") {
        event.preventDefault();
        setConfig((current) => ({
          ...current,
          media: {
            ...current.media,
            zoom: Math.max(1, current.media.zoom - 0.1),
          },
        }));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedLayer]);

  useEffect(() => {
    if (!news || !template || designLoading || initialized) return;
    const nextTitle =
      savedDesign?.title_text || news.generated_title || news.original_title || "";
    const nextCategory =
      savedDesign?.category_text ||
      news.highlight ||
      news.categories?.name ||
      "";
    // Hydration from the saved design/news is the initial editor state.
    const restored = mergeDesignConfig(savedDesign?.config_json);
    const sourceCount = Math.max(
      1,
      news.temporary_media_paths?.length ||
        (news.temporary_media_path ? 1 : 0),
      restored.slides.length,
    );
    const slides = restored.slides.length
      ? restored.slides
      : Array.from({ length: sourceCount }, (_, sourceIndex) => ({
          id: crypto.randomUUID(),
          sourceIndex,
          mediaAssetPath: sourceIndex === 0 ? savedDesign?.media_asset_path || null : null,
          mediaMimeType: sourceIndex === 0 ? savedDesign?.media_mime_type || null : null,
          title: nextTitle,
          category: nextCategory,
          media: { ...restored.media },
          showTitle: true,
          showCategory: restored.showCategory,
          showBrand: restored.showBrand,
        } satisfies CarouselSlide));
    const restoredIndex = Math.max(
      0,
      slides.findIndex((slide) => slide.id === restored.activeSlideId),
    );
    const activeSlide = slides[restoredIndex] || slides[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSlideIndex(restoredIndex);
    setTitle(activeSlide?.title || nextTitle);
    setCategory(activeSlide?.category || nextCategory);
    setConfig({
      ...restored,
      media: activeSlide?.media || restored.media,
      showCategory: activeSlide?.showCategory ?? restored.showCategory,
      showBrand: activeSlide?.showBrand ?? restored.showBrand,
      slides,
      activeSlideId: activeSlide?.id || null,
    });
    setMediaMime(savedDesign?.media_mime_type || null);
    if (savedDesign?.status === "failed") {
      setLastError(
        savedDesign.error_message || "A última renderização não foi concluída.",
      );
      setLastFailedAction("export");
    }
    setInitialized(true);
  }, [designLoading, initialized, news, savedDesign, template]);

  useEffect(() => {
    if (!initialized || !news || mediaFile) return;
    let cancelled = false;
    async function loadSource() {
      setSourceLoading(true);
      setSourceError(null);
      try {
        if (activeSlide?.mediaAssetPath) {
          const { data: signed, error: signedError } = await supabase.storage
            .from("news-designs")
            .createSignedUrl(activeSlide.mediaAssetPath, 3600);
          if (!signedError && signed?.signedUrl) {
            if (!cancelled) {
              setMediaUrl(signed.signedUrl);
              setMediaMime(activeSlide.mediaMimeType || null);
              setPreparedMediaPath(activeSlide.mediaAssetPath);
            }
            return;
          }
        }
        const { data, error } = await supabase.functions.invoke(
          "prepare-design-media",
          { body: { news_item_id: news.id, media_index: activeSlideIndex } },
        );
        if (error || !data?.url) {
          const detail = await prepareMediaError(error, data);
          throw Object.assign(new Error(detail.message), { code: detail.code });
        }
        if (!cancelled) {
          setMediaUrl(data.url);
          setMediaMime(data.mime_type);
          setPreparedMediaPath(data.path);
          setConfig((current) => ({
            ...current,
            slides: current.slides.map((slide, index) =>
              index === activeSlideIndex
                ? {
                    ...slide,
                    mediaAssetPath: data.path,
                    mediaMimeType: data.mime_type,
                  }
                : slide,
            ),
          }));
        }
      } catch (error) {
        if (!cancelled) {
          const detail = error as Error & {
            code?: MediaLoadError["code"];
          };
          setSourceError({
            code: detail.code || "MEDIA_UNAVAILABLE",
            message:
              detail.message || "Não foi possível carregar a mídia original.",
          });
          console.error("Falha ao preparar mídia da arte", {
            newsId: news.id,
            code: detail.code,
            message: detail.message,
          });
        }
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    }
    void loadSource();
    return () => {
      cancelled = true;
    };
  }, [
    activeSlide?.mediaAssetPath,
    activeSlide?.mediaMimeType,
    activeSlideIndex,
    initialized,
    mediaFile,
    mediaRetryVersion,
    news,
  ]);

  useEffect(() => {
    if (
      !initialized ||
      !news ||
      carouselPreparedRef.current ||
      config.slides.length < 2
    ) return;
    let cancelled = false;
    carouselPreparedRef.current = true;
    void Promise.all(
      config.slides.map(async (slide) => {
        if (slide.mediaAssetPath) {
          const { data } = await supabase.storage
            .from("news-designs")
            .createSignedUrl(slide.mediaAssetPath, 3600);
          return data?.signedUrl
            ? { id: slide.id, url: data.signedUrl, path: slide.mediaAssetPath, mime: slide.mediaMimeType }
            : null;
        }
        const { data, error } = await supabase.functions.invoke(
          "prepare-design-media",
          { body: { news_item_id: news.id, media_index: slide.sourceIndex } },
        );
        return error || !data?.url
          ? null
          : { id: slide.id, url: data.url, path: data.path, mime: data.mime_type };
      }),
    ).then((items) => {
      if (cancelled) return;
      const available = items.filter(
        (item): item is NonNullable<typeof item> => Boolean(item),
      );
      setSlidePreviewUrls(
        Object.fromEntries(available.map((item) => [item.id, item.url])),
      );
      setConfig((current) => ({
        ...current,
        slides: current.slides.map((slide) => {
          const prepared = available.find((item) => item.id === slide.id);
          return prepared
            ? {
                ...slide,
                mediaAssetPath: prepared.path,
                mediaMimeType: prepared.mime,
              }
            : slide;
        }),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [config.slides, initialized, news]);

  useEffect(
    () => () => {
      if (mediaFile && mediaUrl.startsWith("blob:"))
        URL.revokeObjectURL(mediaUrl);
    },
    [mediaFile, mediaUrl],
  );

  const updateConfig = useCallback(
    (next: Partial<DesignConfig>) =>
      setConfig((current) => ({ ...current, ...next })),
    [],
  );

  function withActiveSlide(current: DesignConfig): DesignConfig {
    if (!current.slides.length) return current;
    return {
      ...current,
      activeSlideId: current.slides[activeSlideIndex]?.id || null,
      slides: current.slides.map((slide, index) =>
        index === activeSlideIndex
          ? {
              ...slide,
              title,
              category,
              media: { ...current.media },
              mediaAssetPath: preparedMediaPath || slide.mediaAssetPath,
              mediaMimeType: mediaMime || slide.mediaMimeType,
              showCategory: current.showCategory,
              showBrand: current.showBrand,
            }
          : slide,
      ),
    };
  }

  function activateSlide(index: number) {
    if (index === activeSlideIndex || !config.slides[index]) return;
    if (mediaFile) {
      toast.info("Salve a nova mídia antes de trocar de página para não perder o arquivo.");
      return;
    }
    const committed = withActiveSlide(config);
    const nextSlide = committed.slides[index];
    if (mediaUrl.startsWith("blob:")) URL.revokeObjectURL(mediaUrl);
    setConfig({
      ...committed,
      activeSlideId: nextSlide.id,
      media: { ...nextSlide.media },
      showCategory: nextSlide.showCategory,
      showBrand: nextSlide.showBrand,
    });
    setTitle(nextSlide.title);
    setCategory(nextSlide.category);
    setMediaFile(null);
    setMediaUrl("");
    setMediaMime(nextSlide.mediaMimeType);
    setPreparedMediaPath(nextSlide.mediaAssetPath);
    setActiveSlideIndex(index);
    setSelectedLayer(null);
  }

  function duplicateActiveSlide() {
    const committed = withActiveSlide(config);
    const source = committed.slides[activeSlideIndex];
    if (!source) return;
    const copy = { ...source, id: crypto.randomUUID(), media: { ...source.media } };
    const slides = [...committed.slides];
    slides.splice(activeSlideIndex + 1, 0, copy);
    setConfig({ ...committed, slides, activeSlideId: copy.id });
    setActiveSlideIndex(activeSlideIndex + 1);
    toast.success("Página duplicada");
  }

  function addCarouselPage() {
    const committed = withActiveSlide(config);
    const source = committed.slides[activeSlideIndex];
    if (!source) return;
    const page: CarouselSlide = {
      ...source,
      id: crypto.randomUUID(),
      sourceIndex: source.sourceIndex,
      media: { ...DEFAULT_DESIGN_CONFIG.media },
    };
    const slides = [...committed.slides];
    slides.splice(activeSlideIndex + 1, 0, page);
    setConfig({
      ...committed,
      slides,
      activeSlideId: page.id,
      media: { ...page.media },
    });
    setActiveSlideIndex(activeSlideIndex + 1);
    setMediaFile(null);
    setMediaUrl("");
    setMediaMime(null);
    setPreparedMediaPath(null);
    window.setTimeout(() => uploadRef.current?.click(), 0);
  }

  function removeActiveSlide() {
    if (config.slides.length <= 1) return toast.error("O carrossel precisa ter ao menos uma página.");
    const committed = withActiveSlide(config);
    const slides = committed.slides.filter((_, index) => index !== activeSlideIndex);
    const nextIndex = Math.min(activeSlideIndex, slides.length - 1);
    const next = slides[nextIndex];
    setConfig({ ...committed, slides, activeSlideId: next.id, media: { ...next.media } });
    setTitle(next.title);
    setCategory(next.category);
    setActiveSlideIndex(nextIndex);
    setMediaFile(null);
    setMediaUrl("");
    setPreparedMediaPath(next.mediaAssetPath);
    setMediaMime(next.mediaMimeType);
  }

  function reorderSlides(from: number, to: number) {
    if (from === to || !config.slides[from] || !config.slides[to]) return;
    const committed = withActiveSlide(config);
    const slides = [...committed.slides];
    const [moved] = slides.splice(from, 1);
    slides.splice(to, 0, moved);
    setConfig({ ...committed, slides, activeSlideId: moved.id });
    setActiveSlideIndex(to);
  }

  function changeDesignFormat(nextFormat: DesignFormat) {
    if (nextFormat === config.format) return;
    const cropped = significantCrop(dimensions.width, dimensions.height, nextFormat);
    setConfig((current) => applyDesignFormat(withActiveSlide(current), nextFormat));
    localStorage.setItem("copy-news-last-design-format", nextFormat);
    if (cropped) toast.warning("Este formato exige um recorte relevante. Revise o enquadramento.");
  }

  function editLayer(layer: Exclude<SelectedLayer, null>) {
    setSelectedLayer(layer);
    if (layer === "title") {
      openPanel("titulo");
      requestAnimationFrame(() => titleInputRef.current?.focus());
    } else if (layer === "category") {
      openPanel("categoria");
      requestAnimationFrame(() => categoryInputRef.current?.focus());
    } else openPanel("midia");
  }

  function resetTemplate() {
    const restored = applyDesignFormat(structuredClone(DEFAULT_DESIGN_CONFIG), config.format);
    setConfig({ ...restored, slides: config.slides, activeSlideId: activeSlide?.id || null });
    setTitle(news?.generated_title || news?.original_title || "");
    setCategory(news?.highlight || news?.categories?.name || "");
    toast.success("Modelo restaurado");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateDesignMedia(file);
    if (validation) {
      toast.error(validation);
      event.target.value = "";
      return;
    }
    if (mediaUrl.startsWith("blob:")) URL.revokeObjectURL(mediaUrl);
    setMediaFile(file);
    setPreparedMediaPath(null);
    setSourceError(null);
    const localUrl = URL.createObjectURL(file);
    setMediaMime(file.type);
    setMediaUrl(localUrl);
    const slideId = config.slides[activeSlideIndex]?.id;
    if (slideId)
      setSlidePreviewUrls((current) => ({ ...current, [slideId]: localUrl }));
    setConfig((current) => ({
      ...current,
      media: { ...DEFAULT_DESIGN_CONFIG.media },
      slides: current.slides.map((slide, index) =>
        index === activeSlideIndex
          ? {
              ...slide,
              mediaAssetPath: null,
              mediaMimeType: file.type,
              media: { ...DEFAULT_DESIGN_CONFIG.media },
            }
          : slide,
      ),
    }));
    event.target.value = "";
  }

  async function uploadBlob(
    path: string,
    blob: Blob,
    contentType: string,
  ) {
    await uploadStorageFile("news-designs", path, blob, {
      contentType,
      upsert: true,
      onProgress: blob.size > 6 * 1024 * 1024 ? setUploadProgress : undefined,
    });
    return path;
  }

  async function persistMediaAsset(designId: string) {
    if (preparedMediaPath && !mediaFile)
      return {
        path: preparedMediaPath,
        mime: mediaMime || "image/jpeg",
      };
    if (savedDesign?.media_asset_path && !mediaFile)
      return {
        path: savedDesign.media_asset_path,
        mime: savedDesign.media_mime_type || "image/jpeg",
      };
    if (!mediaElement || !mediaUrl)
      return { path: null, mime: null };

    let blob: Blob;
    if (mediaFile) {
      blob = mediaFile;
    } else {
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error("Não foi possível preservar a mídia.");
      blob = await response.blob();
    }
    const mime = mediaMime || blob.type || "image/jpeg";
    const path = `${profile!.organization_id}/${news!.id}/${designId}/source.${extensionForMime(mime)}`;
    await uploadBlob(path, blob, mime);
    return { path, mime };
  }

  async function persistDesign(exportRequested: boolean) {
    if (
      !profile ||
      !news ||
      !template ||
      !stageRef.current ||
      saving
    )
      return null;
    if (!title.trim()) {
      toast.error("Informe o título da arte.");
      setTab("titulo");
      setPanelOpen(true);
      return null;
    }
    if (!fitted.fits) {
      toast.error(
        `O título ultrapassa ${config.title.maxLines} linhas. Encurte o texto antes de exportar.`,
      );
      setTab("titulo");
      setPanelOpen(true);
      return null;
    }
    if (!mediaElement) {
      toast.error("Escolha uma mídia para a arte.");
      setTab("midia");
      setPanelOpen(true);
      return null;
    }

    setSaving(true);
    setRenderProgress(10);
    setLastError("");
    setLastFailedAction(null);
    const designId = savedDesign?.id || crypto.randomUUID();
    const committedConfig = withActiveSlide(config);
    let persistedConfig: DesignConfig = {
      ...committedConfig,
      media: {
        ...committedConfig.media,
        currentTime:
          mediaElement instanceof HTMLVideoElement
            ? mediaElement.currentTime
            : 0,
        muted:
          mediaElement instanceof HTMLVideoElement
            ? mediaElement.muted
            : committedConfig.media.muted,
      },
    };
    const videoExport =
      exportRequested && mediaElement instanceof HTMLVideoElement;
    try {
      const { error: startError } = await supabase
        .from("news_designs")
        .upsert(
          {
            id: designId,
            organization_id: profile.organization_id,
            news_id: news.id,
            template_id: template.id,
            title_text: title.trim(),
            category_text: category.trim(),
            media_asset_path:
              preparedMediaPath || savedDesign?.media_asset_path || null,
            media_mime_type: mediaMime || savedDesign?.media_mime_type,
            config_json: persistedConfig,
            preview_path: savedDesign?.preview_path || null,
            overlay_asset_path: savedDesign?.overlay_asset_path || null,
            exported_file_path: savedDesign?.exported_file_path || null,
            export_format: savedDesign?.export_format || null,
            status: "draft",
            render_progress: 0,
            render_started_at: null,
            error_message: null,
            created_by: savedDesign?.created_by || profile.id,
            updated_by: profile.id,
          },
          { onConflict: "id" },
        );
      if (startError) throw startError;

      const media = await persistMediaAsset(designId);
      persistedConfig = {
        ...persistedConfig,
        slides: persistedConfig.slides.map((slide, index) =>
          index === activeSlideIndex
            ? {
                ...slide,
                mediaAssetPath: media.path,
                mediaMimeType: media.mime,
              }
            : slide,
        ),
      };
      setConfig(persistedConfig);
      setRenderProgress(35);
      let overlayPath = savedDesign?.overlay_asset_path || null;
      if (mediaElement instanceof HTMLVideoElement && mediaLayerRef.current) {
        mediaLayerRef.current.hide();
        stageRef.current.draw();
        try {
          const overlayBlob = await canvasBlob(
            stageRef.current,
            previewScale,
            "png",
          );
          overlayPath = `${profile.organization_id}/${news.id}/${designId}/overlay.png`;
          await uploadBlob(overlayPath, overlayBlob, "image/png");
        } finally {
          mediaLayerRef.current.show();
          stageRef.current.draw();
        }
      }
      const previewBlob = await canvasBlob(
        stageRef.current,
        previewScale,
        "jpg",
        0.78,
      );
      const previewPath = `${profile.organization_id}/${news.id}/${designId}/preview.jpg`;
      await uploadBlob(previewPath, previewBlob, "image/jpeg");
      setRenderProgress(60);

      let exportedPath = savedDesign?.exported_file_path || null;
      let exportedBlob: Blob | null = null;
      if (exportRequested && !videoExport) {
        exportedBlob = await canvasBlob(
          stageRef.current,
          previewScale,
          format,
        );
        const mime = format === "png" ? "image/png" : "image/jpeg";
        exportedPath = `${profile.organization_id}/${news.id}/${designId}/export-${Date.now()}.${format}`;
        await uploadBlob(exportedPath, exportedBlob, mime);
        setRenderProgress(80);
      }

      const values = {
        id: designId,
        organization_id: profile.organization_id,
        news_id: news.id,
        template_id: template.id,
        title_text: title.trim(),
        category_text: category.trim(),
        media_asset_path: media.path,
        media_mime_type: media.mime,
        config_json: persistedConfig,
        preview_path: previewPath,
        overlay_asset_path: overlayPath,
        exported_file_path: exportedPath,
        export_format: exportRequested
          ? videoExport
            ? "mp4"
            : format
          : savedDesign?.export_format || null,
        status: videoExport
          ? "rendering"
          : exportRequested
            ? "ready"
            : "draft",
        render_progress: videoExport ? 5 : 0,
        render_started_at: videoExport ? new Date().toISOString() : null,
        error_message: null,
        created_by: savedDesign?.created_by || profile.id,
        updated_by: profile.id,
      };
      const { error } = await supabase
        .from("news_designs")
        .upsert(values, { onConflict: "id" });
      if (error) throw error;

      const { data: latestVersion } = await supabase
        .from("news_design_versions")
        .select("version_number")
        .eq("design_id", designId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error: versionError } = await supabase
        .from("news_design_versions")
        .insert({
          design_id: designId,
          version_number: (latestVersion?.version_number || 0) + 1,
          title_text: title.trim(),
          category_text: category.trim(),
          media_asset_path: media.path,
          config_json: persistedConfig,
          preview_path: previewPath,
          exported_file_path: exportedPath,
          created_by: profile.id,
        });
      if (versionError) throw versionError;
      setRenderProgress(90);

      if (exportRequested && exportedPath && exportedBlob) {
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const { error: mediaError } = await supabase
          .from("generated_media")
          .insert({
            organization_id: profile.organization_id,
            news_id: news.id,
            design_id: designId,
            storage_path: exportedPath,
            mime_type: mime,
            width: canvasWidth,
            height: canvasHeight,
            created_by: profile.id,
          });
        if (mediaError) throw mediaError;
        await savePreparedMedia(
          new File(
            [exportedBlob],
            `copy-news-${news.id}.${format}`,
            { type: mime },
          ),
        );
      }

      await refetchDesign();
      setRenderProgress(videoExport ? 5 : 100);
      toast.success(
        videoExport
          ? `Vídeo enviado para renderização em ${canvasWidth} × ${canvasHeight}`
          : exportRequested
            ? `Arte exportada em ${canvasWidth} × ${canvasHeight}`
            : "Arte salva",
      );
      return designId;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar a arte.";
      setLastError(message);
      setLastFailedAction(exportRequested ? "export" : "save");
      await supabase
        .from("news_designs")
        .update({
          status: "failed",
          error_message: message,
          updated_by: profile.id,
        })
        .eq("id", designId);
      toast.error(message);
      return null;
    } finally {
      setUploadProgress(null);
      setSaving(false);
    }
  }

  async function selectForPublication() {
    const designId =
      savedDesign?.status === "ready" && savedDesign.exported_file_path
        ? savedDesign.id
        : await persistDesign(true);
    if (!designId || !news) return;
    const { error } = await supabase
      .from("news_items")
      .update({ selected_design_id: designId })
      .eq("id", news.id);
    if (error) return toast.error(error.message);
    toast.success("Arte definida para a publicação");
  }

  async function downloadRenderedVideo() {
    if (!savedDesign?.exported_file_path || !news) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.storage
        .from("news-designs")
        .createSignedUrl(savedDesign.exported_file_path, 600);
      if (error || !data?.signedUrl)
        throw error || new Error("Vídeo renderizado indisponível.");
      const file = await prepareMediaFile(
        data.signedUrl,
        `copy-news-${news.id}`,
      );
      await savePreparedMedia(file, data.signedUrl);
      toast.success("Vídeo pronto para salvar na galeria");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível baixar o vídeo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function downloadOriginalMedia() {
    if (!news || !mediaUrl) return;
    setSaving(true);
    try {
      if (config.slides.length > 1) {
        const { data, error } = await supabase.functions.invoke("temporary-media-url", {
          body: { news_item_id: news.id },
        });
        const urls = (data?.urls?.map((item: { url: string }) => item.url) || data?.download_urls?.map((item: { url: string }) => item.url) || [data?.url])
          .filter((value: unknown): value is string => typeof value === "string" && Boolean(value));
        if (error || !urls.length) throw error || new Error("Mídias originais indisponíveis.");
        const files = await prepareMediaFiles(urls, `copy-news-original-${news.id}`);
        await savePreparedMediaFiles(files, urls);
        toast.success(`${files.length} mídias originais prontas para salvar`);
        return;
      }
      const file = mediaFile || (await prepareMediaFile(mediaUrl, `copy-news-original-${news.id}-${activeSlideIndex + 1}`));
      await savePreparedMedia(file, mediaUrl);
      toast.success("Mídia original pronta para salvar");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível baixar a mídia original.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadEditedCarousel() {
    if (!news || !profile || config.slides.length < 2) return;
    const designId = await persistDesign(false);
    if (!designId) return;
    setSaving(true);
    try {
      const { data: persisted } = await supabase
        .from("news_designs")
        .select("config_json")
        .eq("id", designId)
        .single();
      const committed = persisted?.config_json
        ? mergeDesignConfig(persisted.config_json)
        : withActiveSlide(config);
      const files: File[] = [];
      const generatedRows: {
        organization_id: string;
        news_id: string;
        design_id: string;
        storage_path: string;
        mime_type: "image/png" | "image/jpeg";
        width: number;
        height: number;
        created_by: string;
      }[] = [];
      for (let index = 0; index < committed.slides.length; index += 1) {
        const slide = committed.slides[index];
        const prepared = slide.mediaAssetPath
          ? await supabase.storage
              .from("news-designs")
              .createSignedUrl(slide.mediaAssetPath, 3600)
              .then(({ data, error }) => ({
                data: data?.signedUrl
                  ? { url: data.signedUrl, mime_type: slide.mediaMimeType }
                  : null,
                error,
              }))
          : await supabase.functions.invoke("prepare-design-media", {
              body: { news_item_id: news.id, media_index: slide.sourceIndex },
            });
        if (prepared.error || !prepared.data?.url)
          throw prepared.error || new Error(`Mídia da página ${index + 1} indisponível.`);
        if (String(prepared.data.mime_type || "").startsWith("video/"))
          throw new Error(`A página ${index + 1} contém vídeo. Renderize essa página individualmente em MP4.`);
        const blob = await renderCarouselSlide(prepared.data.url, slide, committed, committed.format, format);
        const mime = format === "png" ? "image/png" : "image/jpeg";
        const storagePath = `${profile.organization_id}/${news.id}/${designId}/carousel-${Date.now()}-${String(index + 1).padStart(2, "0")}.${format}`;
        await uploadBlob(storagePath, blob, mime);
        generatedRows.push({
          organization_id: profile.organization_id,
          news_id: news.id,
          design_id: designId,
          storage_path: storagePath,
          mime_type: mime,
          width: canvasWidth,
          height: canvasHeight,
          created_by: profile.id,
        });
        files.push(new File([blob], `copy-news-${news.id}-${String(index + 1).padStart(2, "0")}.${format}`, { type: mime }));
      }
      const { error: generatedError } = await supabase.from("generated_media").insert(generatedRows);
      if (generatedError) throw generatedError;
      const { error: readyError } = await supabase
        .from("news_designs")
        .update({
          exported_file_path: generatedRows[0].storage_path,
          export_format: format,
          status: "ready",
          render_progress: 100,
          error_message: null,
          config_json: {
            ...committed,
            exportedCarouselPaths: generatedRows.map((row) => row.storage_path),
          },
          updated_by: profile.id,
        })
        .eq("id", designId);
      if (readyError) throw readyError;
      await savePreparedMediaFiles(files);
      await refetchDesign();
      toast.success(`${files.length} páginas exportadas na ordem do carrossel`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar o carrossel.");
    } finally {
      setSaving(false);
    }
  }

  function zoomBy(amount: number) {
    setConfig((current) => ({
      ...current,
      media: {
        ...current.media,
        zoom: Math.max(1, Math.min(3, current.media.zoom + amount)),
      },
    }));
  }

  function setMediaFit(fit: DesignConfig["media"]["fit"]) {
    setConfig((current) => ({
      ...current,
      media: {
        ...current.media,
        fit,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
      },
    }));
  }

  function centerMedia() {
    setConfig((current) => ({
      ...current,
      media: { ...current.media, offsetX: 0, offsetY: 0 },
    }));
  }

  async function toggleVideoPlayback() {
    if (!(mediaElement instanceof HTMLVideoElement)) return;
    try {
      if (
        mediaElement.currentTime < videoTrimStart ||
        mediaElement.currentTime >= videoTrimEnd - 0.02
      ) {
        videoControls.seek(videoTrimStart);
        setVideoCurrentTime(videoTrimStart);
      }
      await videoControls.togglePlayback();
    } catch (error) {
      console.error("Falha ao reproduzir vídeo no editor", error);
      toast.error("O navegador bloqueou a reprodução deste vídeo.");
    }
  }

  function seekVideoBy(seconds: number) {
    const time = Math.max(
      videoTrimStart,
      Math.min(videoTrimEnd, videoCurrentTime + seconds),
    );
    videoControls.seek(time);
    setVideoCurrentTime(time);
    mediaLayerRef.current?.batchDraw();
  }

  function updateVideoTrim(edge: "start" | "end", value: number) {
    const next = edge === "start"
      ? Math.min(value, videoTrimEnd - 0.1)
      : Math.max(value, videoTrimStart + 0.1);
    setConfig((current) => ({
      ...current,
      media: {
        ...current.media,
        trimStart: edge === "start" ? next : current.media.trimStart,
        trimEnd: edge === "end" ? next : current.media.trimEnd,
      },
    }));
    videoControls.seek(next);
    setVideoCurrentTime(next);
  }

  function toggleVideoAudio() {
    if (!(mediaElement instanceof HTMLVideoElement)) return;
    const muted = !config.media.muted;
    videoControls.setMuted(muted);
    setConfig((current) => ({
      ...current,
      media: { ...current.media, muted },
    }));
  }

  function openPanel(nextTab: EditorTab) {
    setTab(nextTab);
    setPanelOpen(true);
  }

  function retryMedia() {
    setSourceError(null);
    setMediaRetryVersion((version) => version + 1);
  }

  function handlePinch(event: Konva.KonvaEventObject<TouchEvent>) {
    const touches = event.evt.touches;
    if (touches.length !== 2) {
      lastPinchDistance.current = null;
      return;
    }
    event.evt.preventDefault();
    const distance = Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );
    if (lastPinchDistance.current) {
      const stage = event.target.getStage();
      const rect = stage?.container().getBoundingClientRect();
      const centerClientX = (touches[0].clientX + touches[1].clientX) / 2;
      const centerClientY = (touches[0].clientY + touches[1].clientY) / 2;
      const pointX = rect ? (centerClientX - rect.left) / previewScale : canvasWidth / 2;
      const pointY = rect ? (centerClientY - rect.top) / previewScale : canvasHeight / 2;
      setConfig((current) => {
        const oldFrame = coverMedia(
          dimensions.width,
          dimensions.height,
          current.media,
          canvasWidth,
          canvasHeight,
        );
        const zoom = pinchZoom(
          current.media.zoom,
          lastPinchDistance.current || distance,
          distance,
        );
        const nextMedia = { ...current.media, zoom };
        const nextFrame = coverMedia(
          dimensions.width,
          dimensions.height,
          nextMedia,
          canvasWidth,
          canvasHeight,
        );
        const sourceX = oldFrame.width ? (pointX - oldFrame.x) / oldFrame.width : 0.5;
        const sourceY = oldFrame.height ? (pointY - oldFrame.y) / oldFrame.height : 0.5;
        return {
          ...current,
          media: {
            ...nextMedia,
            offsetX: nextMedia.offsetX + pointX - (nextFrame.x + sourceX * nextFrame.width),
            offsetY: nextMedia.offsetY + pointY - (nextFrame.y + sourceY * nextFrame.height),
          },
        };
      });
    }
    lastPinchDistance.current = distance;
  }

  if (newsLoading || designLoading || templateLoading)
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoaderCircle className="animate-spin text-primary" />
      </div>
    );

  if (!news || !template)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-xl font-bold">
            Editor indisponível
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A notícia ou o template padrão não foi encontrado.
          </p>
          <Button className="mt-4" onClick={() => navigate(-1)}>
            Voltar
          </Button>
        </div>
      </div>
    );

  const canEdit = profile?.role !== "viewer";
  const activeMediaError = sourceError || mediaError;

  return (
    <div className="flex h-dvh max-w-full flex-col overflow-hidden bg-[#121212] text-white">
      <header
        className="relative z-30 flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-[#121212]/95 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur sm:gap-2 sm:px-4"
        data-testid="design-editor-header"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-11 text-white hover:bg-white/10 hover:text-white"
          onClick={() => navigate(`/noticias/${news.id}`)}
          aria-label="Voltar para a notícia"
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{templateProfile.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-white/60 sm:text-xs">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                savedDesign ? "bg-emerald-500" : "bg-white/35",
              )}
            />
            {savedDesign ? "Versão atual salva" : "Nova arte"} · {canvasWidth} × {canvasHeight}
          </p>
        </div>
        <Button
          variant="ghost"
          className="min-h-11 text-white hover:bg-white/10 hover:text-white"
          onClick={resetTemplate}
          disabled={!canEdit || saving}
          aria-label="Restaurar modelo"
        >
          <RotateCcw size={17} />
          <span className="hidden sm:inline">Restaurar</span>
        </Button>
        <Button
          className="min-h-11 shrink-0 bg-white px-3 text-black hover:bg-white/90"
          onClick={() => void persistDesign(false)}
          disabled={!canEdit || saving}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
          <span>Salvar</span>
        </Button>
        {(saving || savedDesign?.status === "rendering") && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
            role="progressbar"
            aria-label="Progresso da renderização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              savedDesign?.status === "rendering"
                ? savedDesign.render_progress
                : renderProgress
            }
          >
            <div
              className="h-full bg-gradient-to-r from-[#fb0039] to-[#d20836] transition-[width]"
              style={{
                width: `${
                  savedDesign?.status === "rendering"
                    ? savedDesign.render_progress
                    : renderProgress
                }%`,
              }}
            />
          </div>
        )}
      </header>

      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
        className="sr-only"
        onChange={handleUpload}
      />

      {lastError && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100 sm:px-4"
          role="alert"
        >
          <TriangleAlert className="shrink-0" size={18} />
          <p className="min-w-0 flex-1">{lastError}</p>
          <Button
            variant="outline"
            size="sm"
            className="border-red-200/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            onClick={() => void persistDesign(lastFailedAction === "export")}
          >
            <RotateCcw />
            Tentar novamente
          </Button>
        </div>
      )}

      <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_minmax(360px,400px)]">
        <section
          className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#303030_0,#171717_55%,#101010_100%)] p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:p-6"
          data-testid="design-preview-area"
        >
          <div
            ref={previewRef}
            className="relative flex h-full min-h-0 w-full min-w-0 items-center justify-center"
          >
            <div
              className="relative touch-none overflow-hidden bg-black shadow-2xl shadow-black/60"
              style={{
                width: canvasWidth * previewScale,
                height: canvasHeight * previewScale,
              }}
              data-testid="design-stage"
            >
              <Stage
                ref={stageRef}
                width={canvasWidth * previewScale}
                height={canvasHeight * previewScale}
                onMouseDown={(event) => {
                  if (event.target === event.target.getStage()) setSelectedLayer(null);
                }}
                onWheel={(event) => {
                  event.evt.preventDefault();
                  zoomBy(event.evt.deltaY > 0 ? -0.08 : 0.08);
                  setSelectedLayer("media");
                }}
                onTouchMove={handlePinch}
                onTouchEnd={() => {
                  lastPinchDistance.current = null;
                }}
              >
                  <Layer
                    ref={mediaLayerRef}
                    scaleX={previewScale}
                    scaleY={previewScale}
                  >
                    <Rect
                      x={0}
                      y={0}
                      width={canvasWidth}
                      height={canvasHeight}
                      fill="#111111"
                    />
                    {mediaElement && (
                      <KonvaImage
                        image={mediaElement}
                        {...mediaRect}
                        draggable={canEdit}
                        onClick={() => {
                          editLayer("media");
                        }}
                        onTap={() => {
                          editLayer("media");
                        }}
                        dragBoundFunc={(position) => {
                          const clamped = clampMediaPosition(
                            position.x / previewScale,
                            position.y / previewScale,
                            mediaRect.width,
                            mediaRect.height,
                            canvasWidth,
                            canvasHeight,
                          );
                          return {
                            x: clamped.x * previewScale,
                            y: clamped.y * previewScale,
                          };
                        }}
                        onDragEnd={(event) => {
                          const baseX = (canvasWidth - mediaRect.width) / 2;
                          const baseY = (canvasHeight - mediaRect.height) / 2;
                          setConfig((current) => ({
                            ...current,
                            media: {
                              ...current.media,
                              offsetX: event.target.x() - baseX,
                              offsetY: event.target.y() - baseY,
                            },
                          }));
                        }}
                      />
                    )}
                    {(templateProfile.surface === "gradient" || config.showMediaShade) && <Rect
                      x={0}
                      y={templateProfile.overlayStartY}
                      width={canvasWidth}
                      height={canvasHeight - templateProfile.overlayStartY}
                      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                      fillLinearGradientEndPoint={{
                        x: 0,
                        y: canvasHeight - templateProfile.overlayStartY,
                      }}
                      fillLinearGradientColorStops={
                        templateProfile.surface === "box"
                          ? [0, "rgba(0,0,0,0)", 0.45, "rgba(0,0,0,.18)", 1, "rgba(0,0,0,.46)"]
                          : [0, "rgba(0,0,0,0)", 0.45, "rgba(0,0,0,.58)", 1, "rgba(0,0,0,.94)"]
                      }
                    />}
                  </Layer>
                  <Layer
                    ref={overlayLayerRef}
                    listening
                    scaleX={previewScale}
                    scaleY={previewScale}
                  >
                    {config.showBrand && brandImage && (
                      <>
                        <KonvaImage
                          image={brandImage}
                          crop={{ x: 930, y: 110, width: 90, height: 610 }}
                          x={930}
                          y={Math.round(canvasHeight * 0.057)}
                          width={90}
                          height={Math.min(610, Math.round(canvasHeight * 0.45))}
                          listening={canEdit}
                          onClick={() => openPanel("marca")}
                          onTap={() => openPanel("marca")}
                        />
                      </>
                    )}
                    {activeShowTitle && templateProfile.surface === "box" && <Rect
                      x={titleBoxX + 20}
                      y={titleBottom - 2}
                      width={titleBoxWidth - 40}
                      height={15}
                      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                      fillLinearGradientEndPoint={{
                        x: titleBoxWidth - 40,
                        y: 0,
                      }}
                      fillLinearGradientColorStops={[
                        0,
                        "#fb0039",
                        1,
                        "#d20836",
                      ]}
                    />}
                    {activeShowTitle && templateProfile.surface === "box" && <Rect
                      x={titleBoxX}
                      y={titleBoxY}
                      width={titleBoxWidth}
                      height={titleBoxHeight}
                      fill="#ffffff"
                      onClick={() => editLayer("title")}
                      onTap={() => editLayer("title")}
                    />}
                    {activeShowTitle && <KonvaText
                      x={titleTextX}
                      y={titleTextY}
                      width={titleTextWidth}
                      height={titleTextHeight}
                      text={title}
                      fontFamily={config.title.fontFamily}
                      fontSize={effectiveFontSize}
                      fontStyle="bold"
                      lineHeight={config.title.lineHeight}
                      align={config.title.align}
                      verticalAlign="middle"
                      fill={titleColorForSurface(templateProfile.surface)}
                      wrap="word"
                      onClick={() => editLayer("title")}
                      onTap={() => editLayer("title")}
                      onDblClick={() => editLayer("title")}
                    />}
                    {config.showCategory && category.trim() && (
                      <Group
                        onClick={() => editLayer("category")}
                        onTap={() => editLayer("category")}
                        onDblClick={() => editLayer("category")}
                      >
                        <Rect
                          x={categoryX}
                          y={categoryY}
                          width={categoryWidth}
                          height={templateProfile.category.height}
                          cornerRadius={templateProfile.category.height / 2}
                          fillLinearGradientStartPoint={{ x: 0, y: 0 }}
                          fillLinearGradientEndPoint={{
                            x: categoryWidth,
                            y: 0,
                          }}
                          fillLinearGradientColorStops={[
                            0,
                            "#fb0039",
                            1,
                            "#d20836",
                          ]}
                        />
                        <KonvaText
                          x={categoryX + 24}
                          y={categoryY}
                          width={categoryWidth - 48}
                          height={templateProfile.category.height}
                          text={category.toLocaleUpperCase("pt-BR")}
                          fontFamily={config.title.fontFamily}
                          fontSize={templateProfile.category.fontSize}
                          fontStyle="bold"
                          align="center"
                          verticalAlign="middle"
                          fill="#ffffff"
                        />
                      </Group>
                    )}
                    {config.showCredits && config.credits.trim() && (
                      <KonvaText
                        x={62}
                        y={canvasHeight - 90}
                        width={700}
                        height={44}
                        text={config.credits}
                        fontFamily={config.title.fontFamily}
                        fontSize={24}
                        fill="#ffffff"
                        opacity={0.9}
                      />
                    )}
                  </Layer>
              </Stage>
              {isVideo && mediaElement instanceof HTMLVideoElement && !activeMediaError && (
                <div
                  className="absolute inset-x-2 bottom-2 z-20 rounded-xl border border-white/10 bg-black/55 p-1.5 text-white shadow-lg backdrop-blur-sm"
                  data-testid="video-player-overlay"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <input
                    type="range"
                    className="h-5 w-full accent-[#fb0039]"
                    min={videoTrimStart}
                    max={videoTrimEnd}
                    step={0.05}
                    value={Math.max(videoTrimStart, Math.min(videoCurrentTime, videoTrimEnd))}
                    onChange={(event) => {
                      const time = Number(event.target.value);
                      videoControls.seek(time);
                      setVideoCurrentTime(time);
                    }}
                    aria-label="Posição do vídeo"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-full hover:bg-white/15"
                      onClick={() => seekVideoBy(-5)}
                      aria-label="Voltar 5 segundos"
                    >
                      <span className="relative"><SkipBack size={19} /><small className="absolute inset-0 grid place-items-center text-[7px] font-black">5</small></span>
                    </button>
                    <button
                      type="button"
                      className="grid size-11 place-items-center rounded-full bg-white text-black"
                      onClick={() => void toggleVideoPlayback()}
                      aria-label={videoPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
                    >
                      {videoPlaying ? <Pause size={20} /> : <Play className="translate-x-px" size={20} />}
                    </button>
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-full hover:bg-white/15"
                      onClick={() => seekVideoBy(5)}
                      aria-label="Adiantar 5 segundos"
                    >
                      <span className="relative"><SkipForward size={19} /><small className="absolute inset-0 grid place-items-center text-[7px] font-black">5</small></span>
                    </button>
                    <span className="min-w-20 flex-1 px-1 text-center text-[10px] tabular-nums text-white/70">
                      {formatMediaTime(videoCurrentTime)} / {formatMediaTime(videoTrimEnd)}
                    </span>
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-full hover:bg-white/15"
                      onClick={toggleVideoAudio}
                      aria-label={config.media.muted ? "Ativar áudio" : "Desativar áudio"}
                    >
                      {config.media.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {config.slides.length > 1 && (
              <div
                className="absolute inset-x-1 bottom-1 z-10 rounded-2xl border border-white/10 bg-black/75 p-2 backdrop-blur"
                data-testid="carousel-pages"
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-white/10 disabled:opacity-35"
                    onClick={() => activateSlide(activeSlideIndex - 1)}
                    disabled={activeSlideIndex === 0}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft />
                  </button>
                  <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
                    {config.slides.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        draggable
                        onDragStart={() => setDraggedSlideIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (draggedSlideIndex != null) reorderSlides(draggedSlideIndex, index);
                          setDraggedSlideIndex(null);
                        }}
                        className={cn(
                          "relative grid h-12 min-w-11 shrink-0 place-items-center rounded-lg border text-xs font-bold",
                          index === activeSlideIndex
                            ? "border-[#fb0039] bg-[#fb0039]/20 text-white"
                            : "border-white/15 bg-white/5 text-white/65",
                        )}
                        onClick={() => activateSlide(index)}
                        aria-label={`Editar página ${index + 1}`}
                      >
                        {slidePreviewUrls[slide.id] && slide.mediaMimeType?.startsWith("image/") && (
                          <img
                            src={slidePreviewUrls[slide.id]}
                            alt=""
                            className="absolute inset-0 size-full rounded-[7px] object-cover opacity-70"
                          />
                        )}
                        <GripVertical className="absolute left-0.5 top-0.5 opacity-30" size={12} />
                        <span className="relative rounded bg-black/65 px-1.5 py-0.5">{index + 1}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="grid h-12 min-w-11 shrink-0 place-items-center rounded-lg border border-dashed border-white/30 text-lg text-white/70 hover:bg-white/10"
                      onClick={addCarouselPage}
                      aria-label="Adicionar página"
                    >
                      +
                    </button>
                  </div>
                  <span className="shrink-0 text-[11px] text-white/60">
                    {activeSlideIndex + 1} de {config.slides.length}
                  </span>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-white/10 disabled:opacity-35"
                    onClick={() => activateSlide(activeSlideIndex + 1)}
                    disabled={activeSlideIndex === config.slides.length - 1}
                    aria-label="Próxima página"
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>
            )}
            {(sourceLoading || mediaLoading || !brandImage) && (
              <div
                className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]"
                role="status"
                aria-label="Preparando mídia"
              >
                <div className="space-y-3 text-center">
                  <LoaderCircle className="mx-auto animate-spin text-[#fb0039]" />
                  <div>
                    <p className="text-sm font-bold">Preparando mídia</p>
                    <p className="mt-1 text-xs text-white/55">
                      Validando e carregando o arquivo original
                    </p>
                  </div>
                  <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-[#fb0039]" />
                  </div>
                </div>
              </div>
            )}
            {activeMediaError && !sourceLoading && !mediaLoading && (
              <div className="absolute inset-0 grid place-items-center bg-black/65 p-4">
                <div
                  className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#1b1b1b] p-4 text-center shadow-2xl"
                  role="status"
                >
                  <ImagePlus className="mx-auto text-[#fb0039]" />
                  <p className="mt-2 text-sm font-bold">
                    Adicione a mídia da arte
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/65">
                    {activeMediaError.message}
                  </p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={retryMedia}
                    >
                      <RotateCcw />
                      Buscar novamente
                    </Button>
                    <Button
                      className="bg-white text-black hover:bg-white/90"
                      onClick={() => uploadRef.current?.click()}
                      disabled={!canEdit}
                    >
                      <ImagePlus />
                      Escolher da galeria
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[54dvh] min-h-0 flex-col bg-transparent md:pointer-events-auto md:static md:max-h-none md:border-l md:border-white/10 md:bg-[#181818]"
          data-testid="design-controls"
        >
          <div
            className="pointer-events-auto order-2 grid grid-cols-4 border-t border-white/10 bg-[#151515]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:order-1 md:grid-cols-6 md:gap-1 md:border-b md:border-t-0 md:p-2"
            data-testid="design-toolbar"
          >
            {tabs.map((item) => {
              const active = item.id === "titulo"
                ? ["titulo", "categoria", "marca"].includes(tab)
                : tab === item.id;
              return <button
                key={item.id}
                type="button"
                className={cn(
                  "relative flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[10px] font-bold transition md:min-h-11 md:px-0 md:text-[11px]",
                  (item.id === "categoria" || item.id === "marca") && "max-md:hidden",
                  active
                    ? "bg-transparent text-[#fb0039] after:absolute after:inset-x-3 after:top-0 after:h-0.5 after:rounded-full after:bg-[#fb0039] md:bg-white md:text-black md:after:hidden"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
                onClick={() => openPanel(item.id)}
                aria-expanded={panelOpen && active}
              >
                <item.icon className="md:hidden" size={18} />
                {item.id === "titulo" ? (
                  <><span className="md:hidden">Textos</span><span className="hidden md:inline">Título</span></>
                ) : item.label}
              </button>
            })}
          </div>

          <div
            className={cn(
              "pointer-events-auto order-1 min-h-0 flex-1 overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#181818] p-3 pb-4 shadow-[0_-14px_32px_rgba(0,0,0,0.38)] md:order-2 md:block md:rounded-none md:border-t-0 md:p-4 md:shadow-none",
              !panelOpen && "max-md:hidden",
            )}
            data-testid="design-properties-panel"
          >
            <div
              className="sticky top-0 z-30 -mx-3 -mt-3 mb-2 flex items-center justify-between border-b border-white/5 bg-[#181818]/95 px-3 py-1 backdrop-blur md:hidden"
              onTouchStart={(event) => {
                sheetTouchStart.current = event.touches[0]?.clientY ?? null;
              }}
              onTouchEnd={(event) => {
                const start = sheetTouchStart.current;
                const end = event.changedTouches[0]?.clientY;
                sheetTouchStart.current = null;
                if (start != null && end != null && end - start > 55)
                  setPanelOpen(false);
              }}
            >
              <span className="mx-auto h-1 w-12 rounded-full bg-white/35" />
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-full text-white/65 hover:bg-white/10 hover:text-white"
                onClick={() => setPanelOpen(false)}
                aria-label="Fechar painel"
              >
                <X size={20} />
              </button>
            </div>
            {["titulo", "categoria", "marca"].includes(tab) && (
              <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-black/35 p-1 md:hidden">
                {([
                  ["titulo", "Título"],
                  ["categoria", "Destaque"],
                  ["marca", "Marca"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "min-h-11 rounded-lg px-2 text-xs font-bold",
                      tab === value ? "bg-white text-black" : "text-white/65",
                    )}
                    onClick={() => setTab(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {tab === "modelo" && (
              <ControlSection
                title="Modelo"
                description="Escolha o formato da publicação."
              >
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {([
                    ["all", "Todos"],
                    ["story", "Story/Reel"],
                    ["post", "Post"],
                    ["carousel", "Carrossel"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={cn(
                        "min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold",
                        templateFilter === value
                          ? "border-white bg-white text-black"
                          : "border-white/15 text-white/70",
                      )}
                      onClick={() => setTemplateFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2">
                  {(Object.values(DESIGN_TEMPLATES) as (typeof DESIGN_TEMPLATES)[DesignFormat][])
                    .filter((item) =>
                      templateFilter === "all"
                        ? true
                        : templateFilter === "story"
                          ? item.format === "story"
                          : item.format !== "story",
                    )
                    .map((item) => {
                    const active = item.format === config.format;
                    const recommended = suggestDesignFormat(
                      dimensions.width,
                      dimensions.height,
                      mediaCount,
                    ) === item.format;
                    return (
                      <button
                        key={item.format}
                        type="button"
                        className={cn(
                          "flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-left transition",
                          active
                            ? "border-[#fb0039] bg-[#fb0039]/10"
                            : "border-white/10 bg-white/[0.035] hover:bg-white/[0.07]",
                        )}
                        onClick={() => changeDesignFormat(item.format)}
                      >
                        <span
                          className="grid h-14 shrink-0 place-items-end overflow-hidden rounded-lg bg-gradient-to-b from-emerald-400 to-black p-1"
                          style={{ aspectRatio: `${item.width}/${item.height}` }}
                        >
                          <span className="h-1.5 w-full rounded bg-[#fb0039]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-sm">{item.shortName}</b>
                          <span className="mt-1 block text-xs text-white/50">
                            {item.width} × {item.height} · {item.recommendedFor}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          {recommended && <Badge variant="outline">Recomendado</Badge>}
                          {active && <Badge className="bg-[#fb0039] text-white">Atual</Badge>}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {config.format === "story" && (
                  <ToggleControl
                    label="Sombra sobre a mídia"
                    checked={config.showMediaShade}
                    onChange={(showMediaShade) => updateConfig({ showMediaShade })}
                    disabled={!canEdit}
                  />
                )}
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={resetTemplate}
                  disabled={!canEdit}
                >
                  <RotateCcw />
                  Restaurar modelo original
                </Button>
              </ControlSection>
            )}

            {tab === "midia" && (
              <ControlSection
                title="Mídia"
                description="Ajuste o enquadramento e o vídeo."
              >
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-xs font-bold text-white/75">
                    Pré-visualização
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-black">
                      {mediaElement instanceof HTMLImageElement ? (
                        <img
                          src={mediaUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : isVideo ? (
                        <Play className="text-[#fb0039]" />
                      ) : (
                        <ImagePlus className="text-white/35" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {isVideo ? "Vídeo original da notícia" : "Imagem original da notícia"}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        {dimensions.width || "—"} × {dimensions.height || "—"} ·{" "}
                        {mediaMime || "formato não identificado"}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="grid min-h-11 shrink-0 grid-cols-[auto_auto] items-center gap-1.5 rounded-xl border border-white/15 px-2.5 text-xs font-bold text-white/80 hover:bg-white/10"
                      onClick={() => uploadRef.current?.click()}
                      disabled={!canEdit}
                      aria-label="Trocar mídia"
                    >
                      <ImagePlus size={16} /> Trocar
                    </button>
                  </div>
                </div>
                {config.slides.length === 1 && (
                  <Button
                    variant="outline"
                    className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={addCarouselPage}
                  >
                    <CopyPlus /> Adicionar página ao carrossel
                  </Button>
                )}
                {config.slides.length > 1 && (
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                    <p className="col-span-2 text-xs font-bold text-white/70">
                      Página {activeSlideIndex + 1} de {config.slides.length}
                    </p>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={duplicateActiveSlide}
                    >
                      <CopyPlus /> Duplicar
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={removeActiveSlide}
                    >
                      <Trash2 /> Excluir
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => reorderSlides(activeSlideIndex, activeSlideIndex - 1)}
                      disabled={activeSlideIndex === 0}
                    >
                      <ChevronLeft /> Mover antes
                    </Button>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => reorderSlides(activeSlideIndex, activeSlideIndex + 1)}
                      disabled={activeSlideIndex === config.slides.length - 1}
                    >
                      Mover depois <ChevronRight />
                    </Button>
                  </div>
                )}
                {isVideo && mediaElement instanceof HTMLVideoElement && videoDuration > 0 && (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-bold text-white/85">
                        <Scissors size={17} className="text-[#fb0039]" /> Cortar duração
                      </p>
                      <span className="text-xs tabular-nums text-white/55">
                        {formatMediaTime(videoTrimDuration)} selecionados
                      </span>
                    </div>
                    <RangeControl
                      label="Começa em"
                      value={videoTrimStart}
                      min={0}
                      max={Math.max(0.1, videoTrimEnd - 0.1)}
                      step={0.1}
                      display={formatMediaTime(videoTrimStart)}
                      onChange={(value) => updateVideoTrim("start", value)}
                      disabled={!canEdit}
                    />
                    <RangeControl
                      label="Termina em"
                      value={videoTrimEnd}
                      min={Math.min(videoDuration, videoTrimStart + 0.1)}
                      max={videoDuration}
                      step={0.1}
                      display={formatMediaTime(videoTrimEnd)}
                      onChange={(value) => updateVideoTrim("end", value)}
                      disabled={!canEdit}
                    />
                    <Button
                      variant="ghost"
                      className="w-full text-white/75 hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setConfig((current) => ({
                          ...current,
                          media: { ...current.media, trimStart: 0, trimEnd: null },
                        }));
                        videoControls.seek(0);
                        setVideoCurrentTime(0);
                      }}
                    >
                      <RotateCcw /> Usar vídeo completo
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                      onClick={() => {
                        setConfig((current) => ({
                          ...current,
                          media: {
                            ...current.media,
                            currentTime: videoCurrentTime,
                          },
                        }));
                        toast.success("Frame atual definido como capa");
                      }}
                    >
                      <Check /> Usar frame atual como capa
                    </Button>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold text-white/65">
                    Enquadramento
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    <MediaAction
                      label="Menos"
                      icon={ZoomOut}
                      onClick={() => zoomBy(-0.1)}
                      disabled={!canEdit}
                    />
                    <MediaAction
                      label="Mais"
                      icon={ZoomIn}
                      onClick={() => zoomBy(0.1)}
                      disabled={!canEdit}
                    />
                    <MediaAction
                      label="Centro"
                      icon={Move}
                      onClick={centerMedia}
                      disabled={!canEdit}
                    />
                    <MediaAction
                      label="Preencher"
                      icon={Maximize2}
                      onClick={() => setMediaFit("cover")}
                      disabled={!canEdit}
                      active={config.media.fit === "cover"}
                    />
                    <MediaAction
                      label="Ajustar"
                      icon={GalleryVerticalEnd}
                      onClick={() => setMediaFit("contain")}
                      disabled={!canEdit}
                      active={config.media.fit === "contain"}
                    />
                  </div>
                </div>
                <details className="group rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold">
                    Ajustes avançados
                    <span className="text-xs font-normal text-white/45 group-open:hidden">Tamanho, espaço e posição</span>
                    <span className="hidden text-xs font-normal text-white/45 group-open:inline">Ocultar</span>
                  </summary>
                  <div className="mt-3 space-y-5 border-t border-white/10 pt-4">
                <RangeControl
                  label="Zoom"
                  value={config.media.zoom}
                  min={1}
                  max={3}
                  step={0.05}
                  display={`${Math.round(config.media.zoom * 100)}%`}
                  onChange={(zoom) =>
                    setConfig((current) => ({
                      ...current,
                      media: { ...current.media, zoom },
                    }))
                  }
                  disabled={!canEdit}
                />
                <Button
                  variant="ghost"
                  className="w-full text-white hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    setConfig((current) => ({
                      ...current,
                      media: { ...DEFAULT_DESIGN_CONFIG.media },
                    }))
                  }
                  disabled={!canEdit}
                >
                  <RotateCcw />
                  Restaurar enquadramento
                </Button>
                  </div>
                </details>
              </ControlSection>
            )}

            {tab === "titulo" && (
              <ControlSection
                title="Título da notícia"
                description="Escolha uma versão ou ajuste o texto diretamente."
              >
                <div className="grid grid-cols-2 gap-2" aria-label="Versão do título">
                  <button
                    type="button"
                    className={cn(
                      "min-h-11 rounded-xl border px-3 text-xs font-bold",
                      title === (news.generated_title || "")
                        ? "border-white bg-white text-black"
                        : "border-white/15 text-white/75",
                    )}
                    onClick={() => setTitle(news.generated_title || news.original_title || "")}
                    disabled={!canEdit || !news.generated_title}
                    aria-pressed={title === (news.generated_title || "")}
                  >
                    Título novo
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "min-h-11 rounded-xl border px-3 text-xs font-bold",
                      title === (news.original_title || "")
                        ? "border-white bg-white text-black"
                        : "border-white/15 text-white/75",
                    )}
                    onClick={() => setTitle(news.original_title || news.generated_title || "")}
                    disabled={!canEdit || !news.original_title}
                    aria-pressed={title === (news.original_title || "")}
                  >
                    Título original
                  </button>
                </div>
                <Textarea
                  ref={titleInputRef}
                  className="min-h-28 border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  value={title}
                  maxLength={280}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!canEdit}
                />
                <ToggleControl
                  label="Mostrar título nesta página"
                  checked={activeShowTitle}
                  onChange={(showTitle) =>
                    setConfig((current) => ({
                      ...current,
                      slides: current.slides.map((slide, index) =>
                        index === activeSlideIndex ? { ...slide, showTitle } : slide,
                      ),
                    }))
                  }
                  disabled={!canEdit}
                />
                <div>
                  <p className="mb-2 text-xs font-semibold text-white/65">Fonte</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(["Sora", "Open Sans"] as DesignFontFamily[]).map((fontFamily) => (
                      <Button
                        key={fontFamily}
                        variant="outline"
                        className={cn(
                          "border-white/15 text-white hover:bg-white/10 hover:text-white",
                          config.title.fontFamily === fontFamily
                            ? "bg-white text-black hover:bg-white/90 hover:text-black"
                            : "bg-transparent",
                        )}
                        style={{ fontFamily }}
                        onClick={() =>
                          setConfig((current) => ({
                            ...current,
                            title: { ...current.title, fontFamily },
                          }))
                        }
                      >
                        {fontFamily}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-white/55">
                  <span>{title.length}/280 caracteres</span>
                  <span>
                    {fitted.lineCount} linha{fitted.lineCount === 1 ? "" : "s"} ·{" "}
                    {effectiveFontSize}px
                  </span>
                </div>
                {!fitted.fits && (
                  <div
                    className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100"
                    role="alert"
                  >
                    <TriangleAlert className="mt-0.5 shrink-0" size={18} />
                    Encurte o título: ele ultrapassa o limite seguro de {config.title.maxLines}
                    linhas e não será cortado silenciosamente.
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3">
                  <RangeControl
                    label="Tamanho do título"
                    value={config.title.fontSize}
                    min={TITLE_FONT_MIN}
                    max={TITLE_FONT_MAX}
                    step={1}
                    display={`${config.title.fontSize}px`}
                    onChange={(fontSize) =>
                      setConfig((current) => ({
                        ...current,
                        title: { ...current.title, fontSize },
                      }))
                    }
                    disabled={!canEdit}
                  />
                  <p className="text-[11px] leading-relaxed text-white/45">
                    Começa em 40px e reduz automaticamente quando o título precisa caber na área segura.
                  </p>
                </div>
                <details className="group rounded-2xl border border-white/10 bg-white/[0.025] p-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold">
                    Ajustes avançados
                    <span className="text-xs font-normal text-white/45 group-open:hidden">Tamanho, espaço e posição</span>
                    <span className="hidden text-xs font-normal text-white/45 group-open:inline">Ocultar</span>
                  </summary>
                  <div className="mt-3 space-y-5 border-t border-white/10 pt-4">
                <RangeControl
                  label="Espaçamento entre linhas"
                  value={config.title.lineHeight}
                  min={1}
                  max={1.5}
                  step={0.02}
                  display={config.title.lineHeight.toFixed(2)}
                  onChange={(lineHeight) =>
                    setConfig((current) => ({
                      ...current,
                      title: { ...current.title, lineHeight },
                    }))
                  }
                  disabled={!canEdit}
                />
                <RangeControl
                  label="Largura da caixa"
                  value={config.title.width}
                  min={700}
                  max={1032}
                  step={4}
                  display={`${config.title.width}px`}
                  onChange={(width) =>
                    setConfig((current) => ({
                      ...current,
                      title: {
                        ...current.title,
                        width,
                        x: (canvasWidth - width) / 2,
                      },
                    }))
                  }
                  disabled={!canEdit}
                />
                <RangeControl
                  label="Padding horizontal"
                  value={config.title.paddingX}
                  min={12}
                  max={72}
                  step={2}
                  display={`${config.title.paddingX}px`}
                  onChange={(paddingX) =>
                    setConfig((current) => ({
                      ...current,
                      title: { ...current.title, paddingX },
                    }))
                  }
                  disabled={!canEdit}
                />
                <RangeControl
                  label="Padding vertical"
                  value={config.title.paddingY}
                  min={8}
                  max={56}
                  step={2}
                  display={`${config.title.paddingY}px`}
                  onChange={(paddingY) =>
                    setConfig((current) => ({
                      ...current,
                      title: { ...current.title, paddingY },
                    }))
                  }
                  disabled={!canEdit}
                />
                <RangeControl
                  label="Posição vertical"
                  value={config.title.y}
                  min={templateProfile.title.y - 140}
                  max={templateProfile.title.y + 140}
                  step={5}
                  display={`${config.title.y}px`}
                  onChange={(y) =>
                    setConfig((current) => ({
                      ...current,
                      title: { ...current.title, y },
                    }))
                  }
                  disabled={!canEdit}
                />
                  </div>
                </details>
                <div>
                  <p className="mb-2 text-xs font-semibold text-white/65">
                    Alinhamento
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["left", "center", "right"] as TextAlignment[]).map(
                      (align) => (
                        <Button
                          key={align}
                          variant="outline"
                          className={cn(
                            "border-white/15 text-white hover:bg-white/10 hover:text-white",
                            config.title.align === align
                              ? "bg-white text-black hover:bg-white/90 hover:text-black"
                              : "bg-transparent",
                          )}
                          onClick={() =>
                            setConfig((current) => ({
                              ...current,
                              title: { ...current.title, align },
                            }))
                          }
                          disabled={!canEdit}
                        >
                          {align === "left"
                            ? "Esquerda"
                            : align === "center"
                              ? "Centro"
                              : "Direita"}
                        </Button>
                      ),
                    )}
                  </div>
                </div>
                {config.slides.length > 1 && (
                  <Button
                    variant="outline"
                    className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        slides: current.slides.map((slide) => ({ ...slide, title })),
                      }))
                    }
                  >
                    Aplicar título a todas as páginas
                  </Button>
                )}
              </ControlSection>
            )}

            {tab === "categoria" && (
              <ControlSection
                title="Destaque"
                description="Edite o texto da tarja."
              >
                <Input
                  ref={categoryInputRef}
                  className="border-white/15 bg-white/5 text-white"
                  value={category}
                  maxLength={32}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="Ex.: ENTREVISTA EXCLUSIVA"
                  disabled={!canEdit}
                />
                <p className="text-right text-xs text-white/50">
                  {category.length}/32 caracteres
                </p>
                {!!news.highlight_options?.length && (
                  <div className="flex flex-wrap gap-2">
                    {news.highlight_options.map((option: string) => (
                      <button
                        key={option}
                        type="button"
                        className="min-h-11 rounded-full border border-white/15 px-3 text-xs font-bold hover:bg-white/10"
                        onClick={() => setCategory(option)}
                        disabled={!canEdit}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
                <ToggleControl
                  label="Mostrar tarja"
                  checked={config.showCategory}
                  onChange={(showCategory) =>
                    updateConfig({ showCategory })
                  }
                  disabled={!canEdit || !category.trim()}
                />
                {!category.trim() && (
                  <p className="rounded-xl bg-white/5 p-3 text-xs text-white/55">
                    Esta notícia não possui categoria. A tarja ficará oculta até
                    você informar um texto.
                  </p>
                )}
                {config.slides.length > 1 && (
                  <Button
                    variant="outline"
                    className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        slides: current.slides.map((slide) => ({ ...slide, category })),
                      }))
                    }
                  >
                    Aplicar destaque a todas as páginas
                  </Button>
                )}
              </ControlSection>
            )}

            {tab === "marca" && (
              <ControlSection
                title="Francês News"
                description="Marca e créditos da arte."
              >
                <div className="rounded-2xl border border-white/10 bg-black p-3">
                  <img
                    src="/brand/frances-news-vertical.png"
                    alt="Logo vertical da Francês News"
                    className="mx-auto h-40 w-auto object-contain"
                  />
                </div>
                <ToggleControl
                  label="Mostrar identidade nesta página"
                  checked={config.showBrand}
                  onChange={(showBrand) => updateConfig({ showBrand })}
                  disabled={!canEdit}
                />
                {config.slides.length > 1 && (
                  <Button
                    variant="outline"
                    className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        slides: current.slides.map((slide) => ({
                          ...slide,
                          showBrand: current.showBrand,
                        })),
                      }))
                    }
                  >
                    Aplicar identidade a todas as páginas
                  </Button>
                )}
                <ToggleControl
                  label="Mostrar créditos"
                  checked={config.showCredits}
                  onChange={(showCredits) => updateConfig({ showCredits })}
                  disabled={!canEdit}
                />
                {config.showCredits && (
                  <Input
                    className="border-white/15 bg-white/5 text-white"
                    value={config.credits}
                    maxLength={80}
                    onChange={(event) =>
                      updateConfig({ credits: event.target.value })
                    }
                    placeholder="Crédito: @perfil"
                    disabled={!canEdit}
                  />
                )}
              </ControlSection>
            )}

            {tab === "exportar" && (
              <ControlSection
                title="Arquivo final"
                description="Baixe a mídia original ou a versão editada."
              >
                {!isVideo && (
                  <div className="grid grid-cols-2 gap-2">
                    {(["png", "jpg"] as DesignExportFormat[]).map((item) => (
                      <Button
                        key={item}
                        variant="outline"
                        className={cn(
                          "border-white/15 uppercase text-white hover:bg-white/10 hover:text-white",
                          format === item
                            ? "bg-white text-black hover:bg-white/90 hover:text-black"
                            : "bg-transparent",
                        )}
                        onClick={() => setFormat(item)}
                      >
                        {item}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/55">Resolução</span>
                    <b>{canvasWidth} × {canvasHeight}</b>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-white/55">Proporção</span>
                    <b>{templateProfile.ratio}</b>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-white/55">Formato</span>
                    <b className="uppercase">{isVideo ? "mp4" : format}</b>
                  </div>
                  {isVideo && (
                    <div className="mt-2 flex justify-between">
                      <span className="text-white/55">Áudio</span>
                      <b>Original preservado</b>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void downloadOriginalMedia()}
                  disabled={saving || !mediaUrl}
                >
                  <Download /> {config.slides.length > 1 ? `Baixar originais (${config.slides.length})` : "Baixar mídia original"}
                </Button>
                {config.slides.length > 1 && !isVideo && (
                  <Button
                    variant="outline"
                    className="w-full border-[#fb0039]/50 bg-[#fb0039]/10 text-white hover:bg-[#fb0039]/20 hover:text-white"
                    onClick={() => void downloadEditedCarousel()}
                    disabled={saving || !fitted.fits}
                  >
                    <GalleryVerticalEnd /> Baixar carrossel editado ({config.slides.length})
                  </Button>
                )}
                {isVideo && savedDesign?.status === "rendering" && (
                  <div
                    className="rounded-2xl border border-[#fb0039]/30 bg-[#fb0039]/10 p-4"
                    role="status"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-bold">Renderizando vídeo</span>
                      <span>{savedDesign.render_progress}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#fb0039] transition-[width]"
                        style={{ width: `${savedDesign.render_progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-white/60">
                      Você pode sair desta página. O processamento continuará em segundo plano.
                    </p>
                  </div>
                )}
                <Button
                  className="w-full bg-gradient-to-r from-[#fb0039] to-[#d20836] text-white hover:opacity-90"
                  onClick={() =>
                    void (isVideo &&
                    savedDesign?.status === "ready" &&
                    savedDesign.export_format === "mp4"
                      ? downloadRenderedVideo()
                      : persistDesign(true))
                  }
                  disabled={
                    !canEdit ||
                    saving ||
                    !fitted.fits ||
                    savedDesign?.status === "rendering"
                  }
                >
                  {saving || savedDesign?.status === "rendering" ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  {uploadProgress != null
                    ? `Enviando vídeo ${uploadProgress}%`
                    : isVideo
                      ? savedDesign?.status === "rendering"
                      ? `Renderizando ${savedDesign.render_progress}%`
                      : savedDesign?.status === "ready" &&
                          savedDesign.export_format === "mp4"
                        ? "Baixar vídeo"
                        : "Renderizar vídeo"
                      : "Baixar arte"}
                </Button>
                {isVideo &&
                  savedDesign?.status === "ready" &&
                  savedDesign.export_format === "mp4" && (
                    <Button
                      variant="ghost"
                      className="w-full text-white hover:bg-white/10 hover:text-white"
                      onClick={() => void persistDesign(true)}
                      disabled={!canEdit || saving || !fitted.fits}
                    >
                      <RotateCcw />
                      Renderizar nova versão
                    </Button>
                  )}
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void selectForPublication()}
                  disabled={
                    !canEdit ||
                    saving ||
                    !fitted.fits ||
                    savedDesign?.status === "rendering"
                  }
                >
                  <Check />
                  Usar na publicação
                </Button>
              </ControlSection>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function MediaAction({
  label,
  icon: Icon,
  onClick,
  disabled,
  active,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 text-[10px] font-semibold transition",
        active
          ? "border-[#fb0039]/60 bg-[#fb0039]/10 text-[#ff416b]"
          : "border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <Icon size={16} />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function ControlSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-white/55">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between text-xs font-semibold text-white/65">
        {label}
        <b className="text-white">{display}</b>
      </span>
      <input
        type="range"
        className="h-11 w-full accent-[#fb0039]"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/10 px-3">
      <span className="text-sm font-semibold">{label}</span>
      <input
        type="checkbox"
        className="size-5 accent-[#fb0039]"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
