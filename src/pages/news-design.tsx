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
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Move,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Save,
  SkipBack,
  TriangleAlert,
  Volume2,
  VolumeX,
  X,
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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  useDefaultDesignTemplate,
  useNewsDesign,
  useNewsItem,
} from "@/hooks/use-data";
import {
  DEFAULT_DESIGN_CONFIG,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  TITLE_FONT_MAX,
  TITLE_FONT_MIN,
  clampMediaPosition,
  coverMedia,
  extensionForMime,
  fitHeadline,
  mergeDesignConfig,
  validateDesignMedia,
  type DesignConfig,
  type DesignExportFormat,
  type TextAlignment,
} from "@/lib/news-design";
import { prepareMediaFile, savePreparedMedia } from "@/lib/media-download";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type EditorTab =
  | "modelo"
  | "midia"
  | "titulo"
  | "categoria"
  | "marca"
  | "exportar";

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
      restart: () => {
        if (videoRef.current) videoRef.current.currentTime = 0;
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
  const { data: template, isLoading: templateLoading } =
    useDefaultDesignTemplate();
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
  const [renderProgress, setRenderProgress] = useState(0);
  const [lastError, setLastError] = useState("");
  const [lastFailedAction, setLastFailedAction] = useState<
    "save" | "export" | null
  >(null);
  const [format, setFormat] = useState<DesignExportFormat>("png");
  const [previewScale, setPreviewScale] = useState(0.32);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [fontReadyVersion, setFontReadyVersion] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const mediaLayerRef = useRef<Konva.Layer>(null);
  const overlayLayerRef = useRef<Konva.Layer>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const lastPinchDistance = useRef<number | null>(null);
  const sheetTouchStart = useRef<number | null>(null);

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
        config.title.width,
        config.title.lineHeight,
      );
    },
    [config.title.lineHeight, config.title.width, fontReadyVersion, title],
  );
  const effectiveFontSize = Math.min(config.title.fontSize, fitted.fontSize);
  const titleBoxHeight = Math.min(
    360,
    Math.max(212, fitted.requiredHeight + 70),
  );
  const titleBottom = 1574 + (config.title.y - 1404);
  const titleBoxY = titleBottom - titleBoxHeight;
  const titleBoxX = Math.max(32, config.title.x - 40);
  const titleBoxWidth = Math.min(1016, config.title.width + 80);
  const titleTextY = titleBoxY + 34;
  const titleTextHeight = titleBoxHeight - 56;
  const categoryY = titleBoxY - 35;
  const categoryWidth = Math.min(
    760,
    Math.max(330, category.trim().length * 23 + 92),
  );
  const categoryX = (DESIGN_WIDTH - categoryWidth) / 2;
  const mediaRect = coverMedia(
    dimensions.width,
    dimensions.height,
    config.media,
  );

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
    if (!previewRef.current) return;
    const update = () => {
      const element = previewRef.current;
      if (!element) return;
      const availableWidth = Math.max(1, element.clientWidth - 8);
      const availableHeight = Math.max(1, element.clientHeight - 8);
      setPreviewScale(
        Math.min(
          0.46,
          availableWidth / DESIGN_WIDTH,
          availableHeight / DESIGN_HEIGHT,
        ),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [designLoading, newsLoading, templateLoading]);

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
    const handleTime = () => setVideoCurrentTime(video.currentTime);
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
  }, [mediaElement]);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(nextTitle);
    setCategory(nextCategory);
    setConfig(mergeDesignConfig(savedDesign?.config_json));
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
        const { data, error } = await supabase.functions.invoke(
          "prepare-design-media",
          { body: { news_item_id: news.id } },
        );
        if (error || !data?.url) {
          let detail = data as
            | { error?: string; code?: MediaLoadError["code"] }
            | null;
          try {
            detail = await (
              error as unknown as { context?: Response }
            )?.context?.clone().json();
          } catch {
            // Keep the SDK error if the function body is unavailable.
          }
          throw Object.assign(
            new Error(
              detail?.error ||
                error?.message ||
                "Não foi possível preparar a mídia original.",
            ),
            { code: detail?.code || "MEDIA_UNAVAILABLE" },
          );
        }
        if (!cancelled) {
          setMediaUrl(data.url);
          setMediaMime(data.mime_type);
          setPreparedMediaPath(data.path);
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
  }, [initialized, mediaFile, mediaRetryVersion, news]);

  useEffect(
    () => () => {
      if (mediaFile && mediaUrl.startsWith("blob:"))
        URL.revokeObjectURL(mediaUrl);
    },
    [mediaFile, mediaUrl],
  );

  useEffect(() => {
    if (savedDesign?.status !== "rendering") return;
    const timer = window.setInterval(() => {
      void refetchDesign();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refetchDesign, savedDesign?.status]);

  const updateConfig = useCallback(
    (next: Partial<DesignConfig>) =>
      setConfig((current) => ({ ...current, ...next })),
    [],
  );

  function resetTemplate() {
    setConfig(structuredClone(DEFAULT_DESIGN_CONFIG));
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
    setMediaMime(file.type);
    setMediaUrl(URL.createObjectURL(file));
    setConfig((current) => ({
      ...current,
      media: { ...DEFAULT_DESIGN_CONFIG.media },
    }));
    event.target.value = "";
  }

  async function uploadBlob(
    path: string,
    blob: Blob,
    contentType: string,
  ) {
    const { error } = await supabase.storage
      .from("news-designs")
      .upload(path, blob, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });
    if (error) throw error;
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
        "O título ultrapassa cinco linhas. Encurte o texto antes de exportar.",
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
    const persistedConfig: DesignConfig = {
      ...config,
      media: {
        ...config.media,
        currentTime:
          mediaElement instanceof HTMLVideoElement
            ? mediaElement.currentTime
            : 0,
        muted:
          mediaElement instanceof HTMLVideoElement
            ? mediaElement.muted
            : config.media.muted,
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
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
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
          ? "Vídeo enviado para renderização em 1080 × 1920"
          : exportRequested
            ? "Arte exportada em 1080 × 1920"
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

  function nudgeMedia(offsetX: number, offsetY: number) {
    setConfig((current) => ({
      ...current,
      media: {
        ...current.media,
        offsetX: current.media.offsetX + offsetX,
        offsetY: current.media.offsetY + offsetY,
      },
    }));
  }

  async function toggleVideoPlayback() {
    if (!(mediaElement instanceof HTMLVideoElement)) return;
    try {
      await videoControls.togglePlayback();
    } catch (error) {
      console.error("Falha ao reproduzir vídeo no editor", error);
      toast.error("O navegador bloqueou a reprodução deste vídeo.");
    }
  }

  function restartVideo() {
    videoControls.restart();
    mediaLayerRef.current?.batchDraw();
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
      zoomBy((distance - lastPinchDistance.current) / 240);
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
          <p className="truncate text-sm font-bold">{template.name}</p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-white/60 sm:text-xs">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                savedDesign ? "bg-emerald-500" : "bg-white/35",
              )}
            />
            {savedDesign ? "Versão atual salva" : "Nova arte"} · 1080 × 1920
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
              className="touch-none overflow-hidden bg-black shadow-2xl shadow-black/60"
              style={{
                width: DESIGN_WIDTH * previewScale,
                height: DESIGN_HEIGHT * previewScale,
              }}
              data-testid="design-stage"
            >
              <Stage
                ref={stageRef}
                width={DESIGN_WIDTH * previewScale}
                height={DESIGN_HEIGHT * previewScale}
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
                      width={DESIGN_WIDTH}
                      height={DESIGN_HEIGHT}
                      fill="#111111"
                    />
                    {mediaElement && (
                      <KonvaImage
                        image={mediaElement}
                        {...mediaRect}
                        draggable={canEdit}
                        dragBoundFunc={(position) => {
                          const clamped = clampMediaPosition(
                            position.x / previewScale,
                            position.y / previewScale,
                            mediaRect.width,
                            mediaRect.height,
                          );
                          return {
                            x: clamped.x * previewScale,
                            y: clamped.y * previewScale,
                          };
                        }}
                        onDragEnd={(event) => {
                          const baseX = (DESIGN_WIDTH - mediaRect.width) / 2;
                          const baseY = (DESIGN_HEIGHT - mediaRect.height) / 2;
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
                    <Rect
                      x={0}
                      y={1180}
                      width={DESIGN_WIDTH}
                      height={740}
                      fill="#000000"
                      opacity={0.06}
                    />
                  </Layer>
                  <Layer
                    ref={overlayLayerRef}
                    listening={false}
                    scaleX={previewScale}
                    scaleY={previewScale}
                  >
                    {config.showBrand && brandImage && (
                      <>
                        <Group
                          clipX={930}
                          clipY={110}
                          clipWidth={90}
                          clipHeight={535}
                        >
                          <KonvaImage
                            image={brandImage}
                            x={0}
                            y={0}
                            width={DESIGN_WIDTH}
                            height={DESIGN_HEIGHT}
                          />
                        </Group>
                        <Group
                          clipX={930}
                          clipY={630}
                          clipWidth={90}
                          clipHeight={90}
                        >
                          <KonvaImage
                            image={brandImage}
                            x={0}
                            y={0}
                            width={DESIGN_WIDTH}
                            height={DESIGN_HEIGHT}
                          />
                        </Group>
                      </>
                    )}
                    <Rect
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
                    />
                    <Rect
                      x={titleBoxX}
                      y={titleBoxY}
                      width={titleBoxWidth}
                      height={titleBoxHeight}
                      fill="#ffffff"
                    />
                    <KonvaText
                      x={config.title.x}
                      y={titleTextY}
                      width={config.title.width}
                      height={titleTextHeight}
                      text={title}
                      fontFamily="Open Sans"
                      fontSize={effectiveFontSize}
                      fontStyle="bold"
                      lineHeight={config.title.lineHeight}
                      align={config.title.align}
                      verticalAlign="middle"
                      fill="#050505"
                      wrap="word"
                    />
                    {config.showCategory && category.trim() && (
                      <>
                        <Rect
                          x={categoryX}
                          y={categoryY}
                          width={categoryWidth}
                          height={62}
                          cornerRadius={31}
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
                          height={62}
                          text={category.toLocaleUpperCase("pt-BR")}
                          fontFamily="Open Sans"
                          fontSize={36}
                          fontStyle="bold"
                          align="center"
                          verticalAlign="middle"
                          fill="#ffffff"
                        />
                      </>
                    )}
                    {config.showCredits && config.credits.trim() && (
                      <KonvaText
                        x={62}
                        y={1790}
                        width={700}
                        height={44}
                        text={config.credits}
                        fontFamily="Open Sans"
                        fontSize={24}
                        fill="#ffffff"
                        opacity={0.9}
                      />
                    )}
                  </Layer>
              </Stage>
            </div>
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
                  className="w-full max-w-sm rounded-2xl border border-red-400/25 bg-[#241417] p-4 text-center shadow-2xl"
                  role="alert"
                >
                  <TriangleAlert className="mx-auto text-red-300" />
                  <p className="mt-2 text-sm font-bold">
                    Não foi possível abrir a mídia
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
                      Tentar novamente
                    </Button>
                    <Button
                      className="bg-white text-black hover:bg-white/90"
                      onClick={() => uploadRef.current?.click()}
                      disabled={!canEdit}
                    >
                      <ImagePlus />
                      Escolher outra
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <aside
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex max-h-[62dvh] min-h-0 flex-col bg-transparent md:pointer-events-auto md:static md:max-h-none md:border-l md:border-white/10 md:bg-[#181818]"
          data-testid="design-controls"
        >
          <div
            className="pointer-events-auto order-2 grid grid-cols-6 border-t border-white/10 bg-[#151515]/98 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:order-1 md:flex md:gap-1 md:overflow-x-auto md:border-b md:border-t-0 md:p-2"
            data-testid="design-toolbar"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-bold transition md:min-h-11 md:shrink-0 md:flex-row md:px-3 md:text-xs",
                  tab === item.id
                    ? "bg-transparent text-[#fb0039] after:absolute after:inset-x-3 after:top-0 after:h-0.5 after:rounded-full after:bg-[#fb0039] md:bg-white md:text-black md:after:hidden"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
                onClick={() => openPanel(item.id)}
                aria-expanded={panelOpen && tab === item.id}
              >
                <item.icon size={18} />
                {item.label}
              </button>
            ))}
          </div>

          <div
            className={cn(
              "pointer-events-auto order-1 min-h-0 flex-1 overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#181818] p-4 pb-5 shadow-[0_-18px_40px_rgba(0,0,0,0.45)] md:order-2 md:block md:rounded-none md:border-t-0 md:shadow-none",
              !panelOpen && "max-md:hidden",
            )}
            data-testid="design-properties-panel"
          >
            <div
              className="mb-3 flex items-center justify-between md:hidden"
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
            {tab === "modelo" && (
              <ControlSection
                title="Template aplicado"
                description="A identidade visual permanece bloqueada."
              >
                <div className="rounded-2xl border border-[#fb0039]/40 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{template.name}</p>
                      <p className="mt-1 text-xs text-white/55">
                        Story vertical · 9:16 · Open Sans
                      </p>
                    </div>
                    <Badge className="bg-[#fb0039] text-white">Padrão</Badge>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-gradient-to-r from-[#fb0039] to-[#d20836]" />
                </div>
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
                description="Arraste no preview ou use os controles. No celular, faça o gesto de pinça para ampliar."
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
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => uploadRef.current?.click()}
                  disabled={!canEdit}
                >
                  <ImagePlus />
                  Trocar mídia
                </Button>
                {isVideo && mediaElement instanceof HTMLVideoElement && (
                  <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-xs font-bold text-white/75">
                      Controles do vídeo
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-black"
                        onClick={() => void toggleVideoPlayback()}
                        aria-label={videoPlaying ? "Pausar vídeo" : "Reproduzir vídeo"}
                      >
                        {videoPlaying ? <Pause size={19} /> : <Play size={19} />}
                      </button>
                      <button
                        type="button"
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15"
                        onClick={restartVideo}
                        aria-label="Voltar vídeo ao início"
                      >
                        <SkipBack size={18} />
                      </button>
                      <input
                        type="range"
                        className="h-11 min-w-0 flex-1 accent-[#fb0039]"
                        min={0}
                        max={videoDuration || 0}
                        step={0.05}
                        value={Math.min(videoCurrentTime, videoDuration || 0)}
                        onChange={(event) => {
                          const time = Number(event.target.value);
                          videoControls.seek(time);
                          setVideoCurrentTime(time);
                        }}
                        aria-label="Posição do vídeo"
                      />
                      <button
                        type="button"
                        className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/15"
                        onClick={toggleVideoAudio}
                        aria-label={config.media.muted ? "Ativar áudio" : "Desativar áudio"}
                      >
                        {config.media.muted ? (
                          <VolumeX size={18} />
                        ) : (
                          <Volume2 size={18} />
                        )}
                      </button>
                    </div>
                    <p className="text-right text-[11px] text-white/50">
                      {formatMediaTime(videoCurrentTime)} /{" "}
                      {formatMediaTime(videoDuration)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-bold text-white/65">
                    Enquadramento rápido
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
                <div>
                  <p className="mb-2 text-xs font-bold text-white/65">
                    Posição
                  </p>
                  <div className="mx-auto grid w-40 grid-cols-3 gap-1">
                    {[
                      [-28, -28, "↖"],
                      [0, -28, "↑"],
                      [28, -28, "↗"],
                      [-28, 0, "←"],
                      [0, 0, "●"],
                      [28, 0, "→"],
                      [-28, 28, "↙"],
                      [0, 28, "↓"],
                      [28, 28, "↘"],
                    ].map(([x, y, label]) => (
                      <button
                        key={String(label)}
                        type="button"
                        className="grid size-11 place-items-center rounded-lg border border-white/10 text-sm hover:bg-white/10"
                        onClick={() =>
                          Number(x) === 0 && Number(y) === 0
                            ? centerMedia()
                            : nudgeMedia(Number(x), Number(y))
                        }
                        disabled={!canEdit}
                        aria-label={
                          label === "●"
                            ? "Centralizar mídia"
                            : `Mover mídia ${label}`
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
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
              </ControlSection>
            )}

            {tab === "titulo" && (
              <ControlSection
                title="Título da notícia"
                description="O tamanho é reduzido automaticamente até 30 px para preservar todo o texto."
              >
                <Textarea
                  className="min-h-36 border-white/15 bg-white/5 text-white placeholder:text-white/35"
                  value={title}
                  maxLength={280}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={!canEdit}
                />
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
                    Encurte o título: ele ultrapassa o limite seguro de cinco
                    linhas e não será cortado silenciosamente.
                  </div>
                )}
                <RangeControl
                  label="Tamanho máximo"
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
                  max={876}
                  step={4}
                  display={`${config.title.width}px`}
                  onChange={(width) =>
                    setConfig((current) => ({
                      ...current,
                      title: {
                        ...current.title,
                        width,
                        x: (DESIGN_WIDTH - width) / 2,
                      },
                    }))
                  }
                  disabled={!canEdit}
                />
                <RangeControl
                  label="Posição vertical"
                  value={config.title.y}
                  min={1250}
                  max={1500}
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
                <Button
                  variant="ghost"
                  className="w-full text-white hover:bg-white/10 hover:text-white"
                  onClick={() =>
                    setTitle(news.generated_title || news.original_title || "")
                  }
                  disabled={!canEdit}
                >
                  <RotateCcw />
                  Restaurar título da notícia
                </Button>
              </ControlSection>
            )}

            {tab === "categoria" && (
              <ControlSection
                title="Categoria ou destaque"
                description="Somente o texto pode ser alterado; a tarja mantém a identidade visual."
              >
                <Input
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
              </ControlSection>
            )}

            {tab === "marca" && (
              <ControlSection
                title="Francês News"
                description="A posição e as proporções da marca estão bloqueadas."
              >
                <div className="rounded-2xl border border-white/10 bg-black p-4">
                  <img
                    src="/brand/frances-news-vertical.png"
                    alt="Logo vertical da Francês News"
                    className="mx-auto h-52 w-auto object-contain"
                  />
                </div>
                <ToggleControl
                  label="Mostrar identidade visual"
                  checked={config.showBrand}
                  onChange={(showBrand) => updateConfig({ showBrand })}
                  disabled={!canEdit}
                />
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
                description="A renderização sempre usa 1080 × 1920, independentemente do tamanho do preview."
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
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-white/55">Resolução</span>
                    <b>1080 × 1920</b>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span className="text-white/55">Proporção</span>
                    <b>9:16</b>
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
                  {isVideo
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
        "flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-semibold transition",
        active
          ? "border-[#fb0039]/60 bg-[#fb0039]/10 text-[#ff416b]"
          : "border-white/10 text-white/70 hover:bg-white/10 hover:text-white",
      )}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
    >
      <Icon size={18} />
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
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/55">
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
