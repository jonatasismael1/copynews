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
  Download,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Save,
  TriangleAlert,
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
  validateDesignImage,
  type DesignConfig,
  type DesignExportFormat,
  type TextAlignment,
} from "@/lib/news-design";
import { savePreparedMedia } from "@/lib/media-download";
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

const tabs: { id: EditorTab; label: string }[] = [
  { id: "modelo", label: "Modelo" },
  { id: "midia", label: "Mídia" },
  { id: "titulo", label: "Título" },
  { id: "categoria", label: "Categoria" },
  { id: "marca", label: "Marca" },
  { id: "exportar", label: "Exportar" },
];

function useLoadedMedia(url: string, mimeType?: string | null) {
  const [loaded, setLoaded] = useState<{
    url: string;
    element: MediaElement;
  } | null>(null);
  const [errorUrl, setErrorUrl] = useState("");
  const isVideo =
    mimeType?.startsWith("video/") ||
    /\.(mp4|mov|webm)(?:\?|$)/i.test(url);

  useEffect(() => {
    if (!url) return;
    if (isVideo) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "metadata";
      video.playsInline = true;
      video.muted = true;
      video.onloadeddata = () => setLoaded({ url, element: video });
      video.onerror = () => setErrorUrl(url);
      video.src = url;
      video.load();
      return () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      };
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => setLoaded({ url, element: image });
    image.onerror = () => setErrorUrl(url);
    image.src = url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [isVideo, url]);

  return {
    element: loaded?.url === url ? loaded.element : null,
    error: errorUrl === url,
    isVideo,
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

async function videoCoverBlob(video: HTMLVideoElement) {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível capturar a capa do vídeo.");
  context.drawImage(video, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Não foi possível capturar a capa do vídeo.")),
      "image/jpeg",
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
  const { data: template, isLoading: templateLoading } =
    useDefaultDesignTemplate();
  const [tab, setTab] = useState<EditorTab>("modelo");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [config, setConfig] = useState<DesignConfig>(DEFAULT_DESIGN_CONFIG);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
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
  const uploadRef = useRef<HTMLInputElement>(null);
  const lastPinchDistance = useRef<number | null>(null);

  const { element: mediaElement, error: mediaError, isVideo } =
    useLoadedMedia(mediaUrl, mediaMime);
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
      const available = Math.min(
        previewRef.current?.clientWidth || 360,
        window.innerWidth - 24,
      );
      setPreviewScale(Math.min(0.42, Math.max(0.22, available / DESIGN_WIDTH)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!(mediaElement instanceof HTMLVideoElement) || !mediaLayerRef.current)
      return;
    const animation = new Konva.Animation(
      () => undefined,
      mediaLayerRef.current,
    );
    animation.start();
    return () => {
      animation.stop();
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
      try {
        if (savedDesign?.media_asset_path) {
          const { data, error } = await supabase.storage
            .from("news-designs")
            .createSignedUrl(savedDesign.media_asset_path, 3600);
          if (error) throw error;
          if (!cancelled) setMediaUrl(data.signedUrl);
          return;
        }
        const paths = news.temporary_media_paths?.length
          ? news.temporary_media_paths
          : news.temporary_media_path
            ? [news.temporary_media_path]
            : [];
        if (!paths.length) return;
        const { data, error } = await supabase.functions.invoke(
          "temporary-media-url",
          { body: { news_item_id: news.id } },
        );
        if (error || !data?.url)
          throw error || new Error("Mídia original indisponível.");
        if (!cancelled) {
          setMediaUrl(data.url);
          const path = paths[0].toLowerCase();
          setMediaMime(
            path.endsWith(".mp4")
              ? "video/mp4"
              : path.endsWith(".webm")
                ? "video/webm"
                : path.endsWith(".mov")
                  ? "video/quicktime"
                  : path.endsWith(".png")
                    ? "image/png"
                    : path.endsWith(".webp")
                      ? "image/webp"
                      : "image/jpeg",
          );
        }
      } catch (error) {
        if (!cancelled)
          toast.error(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a mídia.",
          );
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    }
    void loadSource();
    return () => {
      cancelled = true;
    };
  }, [initialized, mediaFile, news, savedDesign]);

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

  function resetTemplate() {
    setConfig(structuredClone(DEFAULT_DESIGN_CONFIG));
    setTitle(news?.generated_title || news?.original_title || "");
    setCategory(news?.highlight || news?.categories?.name || "");
    toast.success("Modelo restaurado");
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateDesignImage(file);
    if (validation) {
      toast.error(validation);
      event.target.value = "";
      return;
    }
    if (mediaUrl.startsWith("blob:")) URL.revokeObjectURL(mediaUrl);
    setMediaFile(file);
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
    if (savedDesign?.media_asset_path && !mediaFile)
      return {
        path: savedDesign.media_asset_path,
        mime: savedDesign.media_mime_type || "image/jpeg",
      };
    if (!mediaElement || !mediaUrl)
      return { path: null, mime: null };

    let blob: Blob;
    if (mediaElement instanceof HTMLVideoElement) {
      blob = await videoCoverBlob(mediaElement);
    } else if (mediaFile) {
      blob = mediaFile;
    } else {
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error("Não foi possível preservar a mídia.");
      blob = await response.blob();
    }
    const mime = blob.type || "image/jpeg";
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
      return null;
    }
    if (!fitted.fits) {
      toast.error(
        "O título ultrapassa cinco linhas. Encurte o texto antes de exportar.",
      );
      setTab("titulo");
      return null;
    }
    if (!mediaElement) {
      toast.error("Escolha uma imagem para a arte.");
      setTab("midia");
      return null;
    }

    setSaving(true);
    setRenderProgress(10);
    setLastError("");
    setLastFailedAction(null);
    const designId = savedDesign?.id || crypto.randomUUID();
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
            media_asset_path: savedDesign?.media_asset_path || null,
            media_mime_type: savedDesign?.media_mime_type || mediaMime,
            config_json: config,
            preview_path: savedDesign?.preview_path || null,
            exported_file_path: savedDesign?.exported_file_path || null,
            export_format: savedDesign?.export_format || null,
            status: exportRequested ? "rendering" : "draft",
            error_message: null,
            created_by: savedDesign?.created_by || profile.id,
            updated_by: profile.id,
          },
          { onConflict: "id" },
        );
      if (startError) throw startError;

      const media = await persistMediaAsset(designId);
      setRenderProgress(35);
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
      if (exportRequested) {
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
        config_json: config,
        preview_path: previewPath,
        exported_file_path: exportedPath,
        export_format: exportRequested
          ? format
          : savedDesign?.export_format || null,
        status: exportRequested ? "ready" : "draft",
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
          config_json: config,
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
      setRenderProgress(100);
      toast.success(
        exportRequested ? "Arte exportada em 1080 × 1920" : "Arte salva",
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

  function zoomBy(amount: number) {
    setConfig((current) => ({
      ...current,
      media: {
        ...current.media,
        zoom: Math.max(1, Math.min(3, current.media.zoom + amount)),
      },
    }));
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

  return (
    <div className="flex min-h-dvh flex-col bg-[#121212] text-white">
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-2 border-b border-white/10 bg-[#121212]/95 px-2 backdrop-blur sm:px-4">
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
          <p className="text-xs text-white/60">
            {savedDesign ? "Versão editável salva" : "Nova arte"} · 1080 × 1920
          </p>
        </div>
        <Button
          variant="ghost"
          className="min-h-11 text-white hover:bg-white/10 hover:text-white"
          onClick={resetTemplate}
          disabled={!canEdit || saving}
        >
          <RotateCcw size={17} />
          <span className="hidden sm:inline">Restaurar</span>
        </Button>
        <Button
          className="min-h-11 bg-white text-black hover:bg-white/90"
          onClick={() => void persistDesign(false)}
          disabled={!canEdit || saving}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
          <span className="hidden sm:inline">Salvar</span>
        </Button>
        {saving && (
          <div
            className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
            role="progressbar"
            aria-label="Progresso da renderização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={renderProgress}
          >
            <div
              className="h-full bg-gradient-to-r from-[#fb0039] to-[#d20836] transition-[width]"
              style={{ width: `${renderProgress}%` }}
            />
          </div>
        )}
      </header>

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

      <main className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="flex min-h-[45dvh] items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,#303030_0,#171717_55%,#101010_100%)] p-3 sm:p-6">
          <div
            ref={previewRef}
            className="relative flex h-full w-full items-center justify-center"
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
            {(sourceLoading || !brandImage) && (
              <div className="absolute inset-0 grid place-items-center bg-black/20">
                <LoaderCircle className="animate-spin" />
              </div>
            )}
            {mediaError && (
              <div className="absolute inset-x-4 top-4 rounded-xl bg-red-600 p-3 text-center text-sm">
                Não foi possível abrir a mídia. Escolha outra imagem.
              </div>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-white/10 bg-[#181818] pb-[env(safe-area-inset-bottom)]">
          <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold transition",
                  tab === item.id
                    ? "bg-white text-black"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                title="Enquadramento"
                description="Arraste a imagem no preview e use o zoom. No celular, o gesto de pinça também funciona."
              >
                <input
                  ref={uploadRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleUpload}
                />
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => uploadRef.current?.click()}
                  disabled={!canEdit}
                >
                  <ImagePlus />
                  Trocar imagem
                </Button>
                {isVideo && mediaElement instanceof HTMLVideoElement && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-white/70">
                      Escolha o quadro da capa
                    </p>
                    <video
                      src={mediaUrl}
                      controls
                      playsInline
                      muted
                      className="aspect-video w-full rounded-xl bg-black"
                      onSeeked={() => mediaLayerRef.current?.batchDraw()}
                    />
                    <p className="text-xs text-white/50">
                      A versão de imagem salva o quadro atual. A exportação MP4
                      será adicionada na etapa de vídeo.
                    </p>
                  </div>
                )}
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
                    <b className="uppercase">{format}</b>
                  </div>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-[#fb0039] to-[#d20836] text-white hover:opacity-90"
                  onClick={() => void persistDesign(true)}
                  disabled={!canEdit || saving || !fitted.fits}
                >
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  Baixar arte
                </Button>
                <Button
                  variant="outline"
                  className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void selectForPublication()}
                  disabled={!canEdit || saving || !fitted.fits}
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
