import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  Edit3,
  ExternalLink,
  Archive,
  LoaderCircle,
  MoreHorizontal,
  Palette,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLookups, useNewsItem } from "@/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { statusLabels, type NewsStatus } from "@/lib/constants";
import {
  isAppleMobile,
  prepareMediaFiles,
  savePreparedMediaFiles,
} from "@/lib/media-download";
import { useAuth } from "@/providers/auth-provider";

const allStatuses: NewsStatus[] = [
  "processing",
  "draft",
  "awaiting_approval",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "cancelled",
  "archived",
  "failed",
];
const writerStatuses: NewsStatus[] = [
  "draft",
  "awaiting_approval",
  "cancelled",
  "archived",
];

function mediaUrls(result: {
  url?: string;
  urls?: { url?: string }[];
} | null) {
  const urls = result?.urls?.map((item) => item.url).filter(Boolean) || [];
  return urls.length ? (urls as string[]) : result?.url ? [result.url] : [];
}

function isValidExternalUrl(value?: string | null) {
  if (!value) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function NewsDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: lookups } = useLookups();
  const { data, isLoading, refetch } = useNewsItem(id);
  const [originalTitle, setOriginalTitle] = useState("");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [highlight, setHighlight] = useState("");
  const [status, setStatus] = useState<NewsStatus>("processing");
  const [assignedTo, setAssignedTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [destinationPageId, setDestinationPageId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [preparedMedia, setPreparedMedia] = useState<File[]>([]);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [mobileEditor, setMobileEditor] = useState<{
    field: "highlight" | "title" | "caption" | "originalTitle";
    label: string;
    value: string;
  } | null>(null);
  const [revision, setRevision] = useState<{
    field: "title" | "caption";
    instruction: string;
    preview?: string;
  } | null>(null);
  const lastSaved = useRef("");

  function signature(nextStatus = status) {
    return JSON.stringify([
      originalTitle,
      title,
      caption,
      highlight,
      nextStatus,
      assignedTo,
      categoryId,
      destinationPageId,
      scheduledAt,
    ]);
  }

  useEffect(() => {
    if (!data) return;
    const nextTitle = data.generated_title ?? "";
    const nextOriginalTitle = data.original_title ?? "";
    const nextCaption = data.generated_caption ?? "";
    const nextHighlight = data.highlight ?? "";
    const nextStatus = data.status as NewsStatus;
    const nextAssigned = data.assigned_to ?? "";
    const nextCategory = data.category_id ?? "";
    const nextDestination = data.destination_page_id ?? "";
    const nextSchedule = toMaceioInput(data.scheduled_at);
    // Query hydration is the single source of the initial editable draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOriginalTitle(nextOriginalTitle);
    setTitle(nextTitle);
    setCaption(nextCaption);
    setHighlight(nextHighlight);
    setStatus(nextStatus);
    setAssignedTo(nextAssigned);
    setCategoryId(nextCategory);
    setDestinationPageId(nextDestination);
    setScheduledAt(nextSchedule);
    lastSaved.current = JSON.stringify([
      nextOriginalTitle,
      nextTitle,
      nextCaption,
      nextHighlight,
      nextStatus,
      nextAssigned,
      nextCategory,
      nextDestination,
      nextSchedule,
    ]);
  }, [data]);

  useEffect(() => {
    const job = data?.processing_jobs?.[0];
    if (job && ["queued", "running", "retrying"].includes(job.status)) {
      const timer = setInterval(() => refetch(), 3000);
      return () => clearInterval(timer);
    }
  }, [data, refetch]);

  useEffect(() => {
    if (
      (!data?.temporary_media_path && !data?.temporary_media_paths?.length) ||
      !isAppleMobile()
    )
      return;
    let cancelled = false;
    supabase.functions
      .invoke("temporary-media-url", { body: { news_item_id: data.id } })
      .then(({ data: result, error }) => {
        const urls = mediaUrls(result);
        if (error || !urls.length)
          throw error || new Error("Mídia indisponível");
        return prepareMediaFiles(urls, `copy-news-${data.id}`);
      })
      .then((files) => {
        if (!cancelled) setPreparedMedia(files);
      })
      .catch(() => {
        if (!cancelled) setPreparedMedia([]);
      })
      .finally(() => {
        if (!cancelled) setPreparingMedia(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.id, data?.temporary_media_path, data?.temporary_media_paths]);

  useEffect(() => {
    if (!data || signature() === lastSaved.current) return;
    const timer = setTimeout(() => persist(false), 1200);
    return () => clearTimeout(timer);
    // persist is deliberately driven only by editable field values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    originalTitle,
    title,
    caption,
    highlight,
    status,
    assignedTo,
    categoryId,
    destinationPageId,
    scheduledAt,
    data?.id,
  ]);

  if (isLoading)
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-80" />
      </div>
    );
  if (!data) return <p>Notícia não encontrada.</p>;
  const job = data.processing_jobs?.[0];
  const statuses = profile?.role === "writer" ? writerStatuses : allStatuses;
  const hasPublication = (data.publications?.length ?? 0) > 0;
  const canManageRecord =
    profile?.role === "admin" ||
    profile?.role === "editor" ||
    (profile?.role === "writer" &&
      (data.created_by === profile.id || data.assigned_to === profile.id));
  const editorReady =
    job?.status === "completed" && Boolean(title.trim() && caption.trim());
  const editorType = mediaEditorType(job?.step_results);
  const editorUrl =
    editorType === "video"
      ? profile?.canva_video_url
      : profile?.canva_image_url;
  const highlightOptions: string[] =
    data.highlight_options?.length > 1
      ? (data.highlight_options as string[])
      : highlight
        ? [highlight]
        : [];

  async function persist(showToast: boolean, nextStatus = status) {
    if (!data || saving) return;
    if (nextStatus === "scheduled" && !scheduledAt) {
      if (showToast) toast.error("Informe a data do agendamento.");
      return;
    }
    if (nextStatus === "published" && !hasPublication) {
      if (showToast)
        toast.error(
          "Registre uma publicação vinculada antes de marcar como publicada.",
        );
      return;
    }
    setSaving(true);
    const savedSignature = signature(nextStatus);
    const values = {
      original_title: originalTitle || null,
      generated_title: title,
      generated_caption: caption,
      highlight: highlight.trim().length >= 2 ? highlight.trim() : null,
      status: nextStatus,
      ...(profile?.role === "admin"
        ? { assigned_to: assignedTo || null }
        : {}),
      category_id: categoryId || null,
      destination_page_id: destinationPageId || null,
      scheduled_at:
        nextStatus === "scheduled" && scheduledAt
          ? new Date(`${scheduledAt}:00-03:00`).toISOString()
          : null,
    };
    const { error } = await supabase
      .from("news_items")
      .update(values)
      .eq("id", data.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (nextStatus !== status) setStatus(nextStatus);
    lastSaved.current = savedSignature;
    setSavedAt(new Date());
    await refetch();
    if (showToast) toast.success("Alterações salvas");
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência");
  }

  function openMobileEditor(
    field: "highlight" | "title" | "caption" | "originalTitle",
    label: string,
    value: string,
  ) {
    setMobileEditor({ field, label, value });
  }

  function saveMobileEditor() {
    if (!mobileEditor) return;
    if (mobileEditor.field === "highlight") setHighlight(mobileEditor.value);
    if (mobileEditor.field === "title") setTitle(mobileEditor.value);
    if (mobileEditor.field === "caption") setCaption(mobileEditor.value);
    if (mobileEditor.field === "originalTitle")
      setOriginalTitle(mobileEditor.value);
    setMobileEditor(null);
    toast.success(`${mobileEditor.label} atualizado`);
  }

  async function signedDownload(selectedIndex?: number) {
    setPreparingMedia(true);
    try {
      if (preparedMedia.length) {
        const selectedFiles =
          selectedIndex === undefined
            ? preparedMedia
            : preparedMedia[selectedIndex]
              ? [preparedMedia[selectedIndex]]
              : [];
        await savePreparedMediaFiles(selectedFiles);
        return;
      }
      const { data: result, error } = await supabase.functions.invoke(
        "temporary-media-url",
        { body: { news_item_id: data.id } },
      );
      const urls = mediaUrls(result);
      if (error || !urls.length)
        throw error || new Error("Mídia indisponível");
      const files = await prepareMediaFiles(urls, `copy-news-${data.id}`);
      setPreparedMedia(files);
      const selectedFiles =
        selectedIndex === undefined
          ? files
          : files[selectedIndex]
            ? [files[selectedIndex]]
            : [];
      const selectedUrls =
        selectedIndex === undefined
          ? urls
          : urls[selectedIndex]
            ? [urls[selectedIndex]]
            : [];
      await savePreparedMediaFiles(selectedFiles, selectedUrls);
    } catch (downloadError) {
      if (
        downloadError instanceof DOMException &&
        downloadError.name === "AbortError"
      ) return;
      toast.error("Não foi possível salvar a mídia");
    } finally {
      setPreparingMedia(false);
    }
  }

  async function shareNews() {
    await persist(false);
    const { data: result, error } = await supabase.functions.invoke(
      "share-news",
      { body: { action: "enable", news_id: data.id } },
    );
    if (error || !result?.public_slug)
      return toast.error("Não foi possível criar o link compartilhável");
    const url = `https://copynews.netlify.app/${result.public_slug}`;
    await refetch();
    if (navigator.share) {
      try {
        await navigator.share({ title: title || "Copy News", url });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError")
          return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link público copiado");
  }

  async function revise() {
    if (!revision || revisionLoading) return;
    setRevisionLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(
        "revise-news-field",
        {
          body: {
            news_item_id: data.id,
            field: revision.field,
            instruction: revision.instruction,
          },
        },
      );
      if (error) toast.error("Não foi possível gerar a revisão");
      else setRevision({ ...revision, preview: result.preview });
    } finally {
      setRevisionLoading(false);
    }
  }

  async function confirmRevision() {
    if (!revision?.preview) return;
    setSaving(true);
    const { error } = await supabase.rpc("apply_news_revision", {
      p_news_id: data.id,
      p_field: revision.field,
      p_value: revision.preview,
      p_instruction: revision.instruction,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setRevision(null);
    await refetch();
    setSavedAt(new Date());
    toast.success("Revisão da IA confirmada e versionada.");
  }

  async function retry() {
    const { error } = await supabase.functions.invoke("retry-processing-step", {
      body: { job_id: job?.id },
    });
    if (error) toast.error("Não foi possível retomar");
    else {
      toast.success("Etapa retomada");
      refetch();
    }
  }

  async function deleteNews() {
    if (
      !window.confirm(
        "Excluir permanentemente esta notícia? Esta ação não pode ser desfeita.",
      )
    )
      return;
    setSaving(true);
    const { data: result, error } = await supabase.functions.invoke(
      "manage-news",
      { body: { action: "delete", news_id: data.id } },
    );
    setSaving(false);
    if (error) return toast.error("Não foi possível excluir a notícia");
    if (result.media_cleanup_pending)
      toast.warning("Notícia excluída; a limpeza da mídia será retomada.");
    else toast.success("Notícia excluída");
    navigate("/noticias", { replace: true });
  }

  async function archiveNews() {
    if (!window.confirm("Arquivar esta notícia?")) return;
    setSaving(true);
    const { error } = await supabase.functions.invoke("manage-news", {
      body: { action: "archive", news_id: data.id },
    });
    setSaving(false);
    if (error) return toast.error("Não foi possível arquivar a notícia");
    toast.success("Notícia arquivada");
    navigate("/noticias", { replace: true });
  }

  const originalCaption =
    data.clean_original_caption ||
    data.original_caption ||
    data.source_caption ||
    "";
  const thumbnailUrl = (data.publications ?? []).find(
    (publication: { thumbnail_url?: string | null }) =>
      publication.thumbnail_url,
  )?.thumbnail_url;
  const historyItems = [
    ...(data.news_versions ?? []).map((item: Record<string, string>) => ({
      at: item.created_at,
      text: `${item.field === "title" ? "Título" : "Legenda"} alterado (${item.change_type})`,
    })),
    ...(data.status_history ?? []).map((item: Record<string, string>) => ({
      at: item.created_at,
      text: `Status: ${item.from_status ? statusLabels[item.from_status as NewsStatus] : "inicial"} → ${statusLabels[item.to_status as NewsStatus]}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);
  const nextPrimaryStatus: NewsStatus =
    status === "approved" && hasPublication ? "published" : "approved";
  const primaryStatusLabel =
    status === "published"
      ? "Publicado"
      : status === "approved"
        ? hasPublication
          ? "Publicar"
          : "Aprovada"
        : "Aprovar";
  const mediaPaths = data.temporary_media_paths?.length
    ? data.temporary_media_paths
    : data.temporary_media_path
      ? [data.temporary_media_path]
      : [];
  const mediaCount = Math.max(mediaPaths.length, preparedMedia.length);
  const hasValidSource = isValidExternalUrl(data.source_url);

  function requestDownload() {
    if (mediaCount > 1) {
      setDownloadOpen(true);
      return;
    }
    void signedDownload();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 pb-[calc(11rem+env(safe-area-inset-bottom))] md:space-y-6 md:pb-0">
      <section
        className="-mx-3 border-b bg-background px-3 py-3 md:hidden"
        data-testid="mobile-news-summary"
      >
        <div className="flex items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => navigate(-1)}
            aria-label="Voltar"
          >
            <ArrowLeft />
          </Button>
          {thumbnailUrl && (
            <img
              src={thumbnailUrl}
              alt=""
              className="size-16 shrink-0 rounded-xl object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <Badge className="mb-1.5">{statusLabels[status]}</Badge>
            <h1
              className="font-display text-lg font-bold leading-snug"
              data-testid="mobile-news-title"
            >
              {title || "Notícia em processamento"}
            </h1>
            <p className="mt-2 truncate text-xs text-muted-foreground">
              {data.source_author ||
                data.profiles?.name ||
                data.source_platform ||
                "Origem não identificada"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(data.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais ações"
          >
            <MoreHorizontal />
          </Button>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {data.source_platform && (
            <Badge variant="outline" className="shrink-0">
              {data.source_platform}
            </Badge>
          )}
          {data.categories && (
            <Badge variant="outline" className="shrink-0">
              {data.categories.name}
            </Badge>
          )}
          <Button
            variant="outline"
            className="min-h-11 shrink-0 border-primary/30 bg-primary/5 px-3 text-primary"
            onClick={() => setRevision({ field: "caption", instruction: "" })}
            disabled={!editorReady || saving || revisionLoading}
          >
            <Sparkles size={17} />
            Reescrever
          </Button>
        </div>
      </section>

      <div className="hidden flex-col gap-4 md:flex md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{statusLabels[status]}</Badge>
            {data.categories && (
              <Badge variant="outline">{data.categories.name}</Badge>
            )}
          </div>
          <h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            {title || "Notícia em processamento"}
          </h1>
          <a
            className="mt-2 inline-flex max-w-full items-center gap-1 break-all text-xs text-primary underline-offset-4 hover:underline"
            href={data.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {data.source_url}
            <ExternalLink className="shrink-0" size={13} />
          </a>
          {(data.publications ?? []).map(
            (publication: { id: string; published_url: string; platform: string }) => (
              <a
                key={publication.id}
                className="mt-2 flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                href={publication.published_url}
                target="_blank"
                rel="noreferrer"
              >
                Ver publicação no {publication.platform}
                <ExternalLink size={13} />
              </a>
            ),
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {(saving || savedAt) && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saving
                ? "Salvando…"
                : `Salvo às ${savedAt!.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          )}
          <Button
            variant="outline"
            onClick={requestDownload}
            disabled={!mediaCount || preparingMedia}
          >
            {preparingMedia ? <LoaderCircle className="animate-spin" /> : <Download />}
            {isAppleMobile() ? "Salvar na galeria" : "Baixar mídia"}
          </Button>
          <Button onClick={() => persist(true)} disabled={saving}>
            <Check />
            Salvar agora
          </Button>
          {editorReady && editorUrl && (
            <Button asChild>
              <a href={editorUrl} target="_blank" rel="noreferrer">
                <Palette />
                Abrir editor
              </a>
            </Button>
          )}
          {editorReady && canManageRecord && (
            <Button variant="outline" onClick={shareNews} disabled={saving}>
              <Share2 />
              Compartilhar
            </Button>
          )}
          {editorReady && !editorUrl && (
            <Button variant="outline" asChild>
              <Link to="/configuracoes">
                <Palette />
                Configurar editor
              </Link>
            </Button>
          )}
          {canManageRecord && (
            <>
              <Button variant="outline" onClick={archiveNews} disabled={saving}>
                <Archive />
                Arquivar
              </Button>
              <Button
                variant="destructive"
                onClick={deleteNews}
                disabled={saving}
              >
                <Trash2 />
                Excluir notícia
              </Button>
            </>
          )}
        </div>
      </div>

      {job && job.status !== "completed" && (
        <Card
          className={
            job.status === "failed"
              ? "border-red-200 bg-red-50"
              : "border-primary/20 bg-primary/5"
          }
        >
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              {job.status === "failed" ? (
                <TriangleAlert className="text-red-600" />
              ) : (
                <LoaderCircle className="animate-spin text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3">
                  <p className="font-semibold">
                    {job.status === "failed"
                      ? "Falha no processamento"
                      : `Processando: ${job.current_step}`}
                  </p>
                  <span className="text-sm font-bold">{job.progress}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
                  <div
                    className={
                      job.status === "failed"
                        ? "h-full bg-red-500"
                        : "h-full bg-primary"
                    }
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
                {job.error_message && (
                  <p className="mt-3 text-sm text-red-700">
                    {job.error_message}
                  </p>
                )}
                {job.status === "failed" && (
                  <Button className="mt-4" size="sm" onClick={retry}>
                    <RefreshCw />
                    Retomar esta etapa
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <ResponsiveSection
        title="Destaque"
        summary={`${Math.max(highlightOptions.length, 1)} opção${highlightOptions.length === 1 ? "" : "ões"} · ${highlight.length} caracteres`}
        defaultOpen
        actions={
          <>
            <CopyAction
              label="Copiar destaque"
              value={highlight}
              onCopy={copy}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-11 md:hidden"
              onClick={() =>
                openMobileEditor("highlight", "Destaque", highlight)
              }
              aria-label="Editar destaque"
            >
              <Edit3 size={18} />
            </Button>
          </>
        }
      >
        <div className="space-y-3 md:space-y-4">
          {highlightOptions.length > 1 && (
            <div
              className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible md:gap-3"
              role="radiogroup"
              aria-label="Opções de destaque"
            >
              {highlightOptions.map((option: string, index: number) => {
                const selected = option === highlight;
                return (
                  <button
                    key={`${option}-${index}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`min-h-11 min-w-[10rem] flex-1 rounded-xl border p-3 text-left transition sm:min-w-0 md:rounded-2xl md:p-4 ${
                      selected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                        : "bg-background hover:border-primary/50"
                    }`}
                    onClick={() => setHighlight(option)}
                  >
                    <span className="block text-xs font-semibold text-muted-foreground">
                      Opção {index + 1}
                    </span>
                    <span className="mt-2 block font-semibold">{option}</span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {option.length} caracteres
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <Input
            className="hidden md:block"
            value={highlight}
            maxLength={50}
            placeholder="Selecione ou ajuste o destaque"
            onChange={(event) => setHighlight(event.target.value)}
          />
          <p className="hidden text-right text-xs text-muted-foreground md:block">
            {highlight.length}/50 caracteres
          </p>
        </div>
      </ResponsiveSection>

      <div className="grid gap-3 md:gap-6 lg:grid-cols-2">
        {(
          [
            ["title", "Título", title, setTitle],
            ["caption", "Legenda", caption, setCaption],
          ] as const
        ).map(([field, label, value, setter]) => (
          <ResponsiveSection
            key={field}
            title={label}
            summary={`${value.length} caracteres`}
            defaultOpen
            actions={
              <>
                <CopyAction
                  label={`Copiar ${label.toLocaleLowerCase("pt-BR")}`}
                  value={value}
                  onCopy={copy}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  onClick={() => setRevision({ field, instruction: "" })}
                  aria-label={`Alterar ${label} com IA`}
                >
                  <Sparkles size={18} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:hidden"
                  onClick={() =>
                    openMobileEditor(field, label, value)
                  }
                  aria-label={`Editar ${label.toLocaleLowerCase("pt-BR")}`}
                >
                  <Edit3 size={18} />
                </Button>
              </>
            }
          >
              <ExpandableText
                value={value}
                lines={field === "caption" ? 6 : 4}
                className="md:hidden"
              />
              <Textarea
                className={cn(
                  "hidden md:block",
                  field === "caption" ? "min-h-64" : "min-h-28",
                )}
                value={value}
                onChange={(event) => setter(event.target.value)}
              />
              <p className="mt-2 hidden text-right text-xs text-muted-foreground md:block">
                {value.length} caracteres
              </p>
          </ResponsiveSection>
        ))}
      </div>

      <ResponsiveSection
        title="Fontes e rastreabilidade"
        summary={`${[originalTitle, originalCaption, data.transcript, data.raw_ocr_text || data.ocr_text, data.ai_warnings?.join("\n")].filter(Boolean).length} registros`}
        actions={
          <div className="flex md:hidden">
            <CopyAction
              label="Copiar título original"
              value={originalTitle}
              onCopy={copy}
            />
            <CopyAction
              label="Copiar legenda original"
              value={originalCaption}
              onCopy={copy}
            />
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 md:gap-5">
          <div>
            <div className="flex min-h-11 items-center justify-between gap-2">
              <p className="text-sm font-semibold">Título Original</p>
              <div className="flex">
                <CopyAction
                  label="Copiar título original"
                  value={originalTitle}
                  onCopy={copy}
                  className="hidden md:inline-flex"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:hidden"
                  onClick={() =>
                    openMobileEditor(
                      "originalTitle",
                      "Título Original",
                      originalTitle,
                    )
                  }
                  aria-label="Editar título original"
                >
                  <Edit3 size={18} />
                </Button>
              </div>
            </div>
            <ExpandableText
              value={originalTitle}
              lines={4}
              className="md:hidden"
            />
            <Textarea
              className="mt-2 hidden min-h-24 text-xs leading-relaxed md:block"
              value={originalTitle}
              placeholder="Não disponível"
              onChange={(event) => setOriginalTitle(event.target.value)}
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">
              {originalTitle.length} caracteres
              <span className="hidden md:inline"> · salvamento automático</span>
            </p>
          </div>
          <Source title="Legenda Original" value={originalCaption} />
          <Source title="Transcrição" value={data.transcript} />
          <Source
            title="OCR bruto (auditoria)"
            value={data.raw_ocr_text || data.ocr_text}
          />
          <Source title="Alertas da IA" value={data.ai_warnings?.join("\n")} />
        </div>
      </ResponsiveSection>

      <ResponsiveSection
        title="Detalhes"
        summary={`${data.source_platform || "Origem"} · ${new Date(data.created_at).toLocaleDateString("pt-BR")}`}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{statusLabels[status]}</Badge>
            {data.profiles?.name && (
              <Badge variant="outline">{data.profiles.name}</Badge>
            )}
            {data.source_platform && (
              <Badge variant="outline">{data.source_platform}</Badge>
            )}
            <Badge variant="outline">
              {new Date(data.created_at).toLocaleString("pt-BR")}
            </Badge>
          </div>
          <a
            className="inline-flex max-w-full items-center gap-1 break-all text-xs text-primary hover:underline"
            href={data.source_url}
            target="_blank"
            rel="noreferrer"
          >
            Abrir fonte original
            <ExternalLink className="shrink-0" size={13} />
          </a>
          {(data.publications ?? []).map(
            (publication: {
              id: string;
              published_url: string;
              platform: string;
            }) => (
              <a
                key={publication.id}
                className="flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                href={publication.published_url}
                target="_blank"
                rel="noreferrer"
              >
                Ver publicação no {publication.platform}
                <ExternalLink size={13} />
              </a>
            ),
          )}
        </div>
      </ResponsiveSection>

      <ResponsiveSection
        title="Fluxo editorial"
        summary={`${statusLabels[status]} · ${data.profiles?.name || "Não atribuído"}`}
      >
        <div className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
          <Field label="Status">
            <select
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value as NewsStatus)}
            >
              {statuses.map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={value === "published" && !hasPublication}
                >
                  {statusLabels[value]}
                  {value === "published" && !hasPublication
                    ? " (registre publicação)"
                    : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Responsável">
            <select
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={assignedTo}
              onChange={(event) => setAssignedTo(event.target.value)}
              disabled={profile?.role !== "admin"}
            >
              <option value="">Não atribuído</option>
              {lookups?.profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {profile?.role !== "admin" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Somente administradores podem trocar o responsável.
              </p>
            )}
          </Field>
          <Field label="Categoria">
            <select
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Sem categoria</option>
              {lookups?.categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Página de destino">
            <select
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
              value={destinationPageId}
              onChange={(event) => setDestinationPageId(event.target.value)}
            >
              <option value="">Sem página</option>
              {lookups?.pages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tom editorial automático">
            <Input value={data.editorial_tone || "Em processamento"} readOnly />
          </Field>
          {status === "scheduled" && (
            <Field label="Agendar para">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </Field>
          )}
        </div>
      </ResponsiveSection>

      <ResponsiveSection
        title="Histórico editorial"
        summary={`${historyItems.length} alteração${historyItems.length === 1 ? "" : "ões"}${historyItems[0] ? ` · ${new Date(historyItems[0].at).toLocaleDateString("pt-BR")}` : ""}`}
      >
        {historyItems.length ? (
          <div className="space-y-3">
            {historyItems.map((item) => (
              <div
                key={`${item.at}-${item.text}`}
                className="flex flex-col gap-1 border-b pb-3 text-sm last:border-0 sm:flex-row sm:gap-3"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(item.at).toLocaleString("pt-BR")}
                </span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            As mudanças de texto e status aparecerão aqui.
          </p>
        )}
      </ResponsiveSection>

      <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-3 gap-2 rounded-2xl border bg-background/95 p-2 shadow-xl backdrop-blur md:hidden">
        {hasValidSource ? (
          <Button variant="outline" className="min-w-0 px-2" asChild>
            <a
              href={data.source_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Abrir fonte"
            >
              <ExternalLink size={18} />
              Abrir fonte
            </a>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="min-w-0 px-2"
            disabled
            title="Link original indisponível"
          >
            <ExternalLink size={18} />
            Abrir fonte
          </Button>
        )}
        <Button
          className="min-w-0 px-2"
          onClick={() => persist(true, nextPrimaryStatus)}
          disabled={
            saving ||
            !canManageRecord ||
            status === "published" ||
            (status === "approved" && !hasPublication)
          }
        >
          <Check size={18} />
          {primaryStatusLabel}
        </Button>
        <Button
          variant="outline"
          className="min-w-0 px-2"
          onClick={requestDownload}
          disabled={!mediaCount || preparingMedia}
        >
          {preparingMedia ? (
            <LoaderCircle className="animate-spin" size={18} />
          ) : (
            <Download size={18} />
          )}
          Baixar
        </Button>
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent aria-describedby="download-media-description">
          <div className="border-b p-5 pr-16">
            <DialogTitle>Baixar mídia</DialogTitle>
            <DialogDescription id="download-media-description">
              Escolha baixar o carrossel completo ou apenas um arquivo.
            </DialogDescription>
          </div>
          <div className="grid gap-2 p-4">
            <Button
              className="justify-start"
              onClick={() => {
                void signedDownload();
                setDownloadOpen(false);
              }}
              disabled={preparingMedia}
            >
              <Download />
              Baixar tudo ({mediaCount})
            </Button>
            {Array.from({ length: mediaCount }, (_, index) => (
              <Button
                key={mediaPaths[index] || preparedMedia[index]?.name || index}
                variant="outline"
                className="justify-start"
                onClick={() => {
                  void signedDownload(index);
                  setDownloadOpen(false);
                }}
                disabled={preparingMedia}
              >
                <Download />
                Baixar arquivo {index + 1}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent aria-describedby="more-actions-description">
          <div className="border-b p-5 pr-16">
            <DialogTitle>Mais ações</DialogTitle>
            <DialogDescription id="more-actions-description">
              Todas as ações secundárias da notícia.
            </DialogDescription>
          </div>
          <div className="grid gap-2 p-4">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                void persist(true);
                setMoreOpen(false);
              }}
              disabled={saving}
            >
              <Check />
              Salvar agora
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => {
                requestDownload();
                setMoreOpen(false);
              }}
              disabled={!mediaCount || preparingMedia}
            >
              {preparingMedia ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              {isAppleMobile() ? "Salvar na galeria" : "Baixar mídia"}
            </Button>
            {editorReady && editorUrl && (
              <Button variant="outline" className="justify-start" asChild>
                <a href={editorUrl} target="_blank" rel="noreferrer">
                  <Palette />
                  Abrir editor
                </a>
              </Button>
            )}
            {editorReady && !editorUrl && (
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/configuracoes">
                  <Palette />
                  Configurar editor
                </Link>
              </Button>
            )}
            {editorReady && canManageRecord && (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  void shareNews();
                  setMoreOpen(false);
                }}
                disabled={saving}
              >
                <Share2 />
                Compartilhar
              </Button>
            )}
            {canManageRecord && (
              <>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => {
                    void archiveNews();
                    setMoreOpen(false);
                  }}
                  disabled={saving}
                >
                  <Archive />
                  Arquivar
                </Button>
                <Button
                  variant="destructive"
                  className="justify-start"
                  onClick={() => {
                    void deleteNews();
                    setMoreOpen(false);
                  }}
                  disabled={saving}
                >
                  <Trash2 />
                  Excluir notícia
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(mobileEditor)}
        onOpenChange={(open) => {
          if (!open) setMobileEditor(null);
        }}
      >
        <DialogContent
          className="inset-0 max-h-none rounded-none sm:inset-auto sm:max-h-[88dvh] sm:rounded-2xl"
          showClose={false}
          aria-describedby="mobile-editor-description"
        >
          {mobileEditor && (
            <div className="flex min-h-dvh flex-col sm:min-h-0">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background p-3">
                <DialogClose asChild>
                  <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <DialogTitle className="truncate">
                  Editar {mobileEditor.label.toLocaleLowerCase("pt-BR")}
                </DialogTitle>
                <Button onClick={saveMobileEditor}>Salvar</Button>
              </div>
              <DialogDescription
                id="mobile-editor-description"
                className="sr-only"
              >
                Edite o conteúdo completo e salve para aplicar.
              </DialogDescription>
              <div className="flex-1 space-y-3 p-4">
                {mobileEditor.field === "highlight" ? (
                  <Input
                    autoFocus
                    maxLength={50}
                    value={mobileEditor.value}
                    onChange={(event) =>
                      setMobileEditor({
                        ...mobileEditor,
                        value: event.target.value,
                      })
                    }
                  />
                ) : (
                  <Textarea
                    autoFocus
                    className="min-h-[55dvh] resize-none"
                    value={mobileEditor.value}
                    onChange={(event) =>
                      setMobileEditor({
                        ...mobileEditor,
                        value: event.target.value,
                      })
                    }
                  />
                )}
                <div className="flex items-center justify-between">
                  <CopyAction
                    label={`Copiar ${mobileEditor.label.toLocaleLowerCase("pt-BR")}`}
                    value={mobileEditor.value}
                    onCopy={copy}
                  />
                  <span className="text-xs text-muted-foreground">
                    {mobileEditor.value.length}
                    {mobileEditor.field === "highlight" ? "/50" : ""} caracteres
                  </span>
                </div>
                {(mobileEditor.field === "title" ||
                  mobileEditor.field === "caption") && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setRevision({
                        field: mobileEditor.field as "title" | "caption",
                        instruction: "",
                      });
                      setMobileEditor(null);
                    }}
                  >
                    <Sparkles />
                    Ajustar com IA
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(revision)}
        onOpenChange={(open) => {
          if (!open) setRevision(null);
        }}
      >
        <DialogContent aria-describedby="revision-description">
          {revision && (
            <>
              <div className="border-b p-5 pr-16">
                <DialogTitle>
                  Alterar {revision.field === "title" ? "título" : "legenda"} com
                  IA
                </DialogTitle>
                <DialogDescription id="revision-description">
                  A IA criará uma prévia. O texto só será substituído após sua
                  confirmação.
                </DialogDescription>
              </div>
              <div className="space-y-4 p-5">
              {!revision.preview ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Deixe mais jornalístico",
                      "Deixe mais curto",
                      "Destaque o fato principal",
                      "Retire opiniões",
                    ].map((instruction) => (
                      <button
                        key={instruction}
                        className="rounded-full border px-3 py-1.5 text-xs"
                        onClick={() =>
                          setRevision({ ...revision, instruction })
                        }
                      >
                        {instruction}
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={revision.instruction}
                    onChange={(event) =>
                      setRevision({
                        ...revision,
                        instruction: event.target.value,
                      })
                    }
                    placeholder="Diga o que deseja mudar..."
                  />
                  <Button
                    className="w-full"
                    onClick={revise}
                    disabled={!revision.instruction || revisionLoading}
                  >
                    {revisionLoading ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {revisionLoading ? "Gerando..." : "Gerar prévia"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">
                    {revision.preview}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setRevision({ ...revision, preview: undefined })
                      }
                    >
                      <RefreshCw />
                      Tentar novamente
                    </Button>
                    <Button onClick={confirmRevision}>
                      <Check />
                      Usar esta versão
                    </Button>
                  </div>
                </>
              )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mediaEditorType(stepResults: unknown): "video" | "image" {
  if (!stepResults || typeof stepResults !== "object") return "video";
  const result = stepResults as {
    media_kind?: string;
    media_items?: { kind?: string }[];
  };
  if (result.media_kind === "image") return "image";
  if (result.media_kind === "carousel")
    return result.media_items?.some((item) => item.kind === "video")
      ? "video"
      : "image";
  return "video";
}

function toMaceioInput(value?: string | null) {
  if (!value) return "";
  return new Date(new Date(value).getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function Source({ title, value }: { title: string; value?: string | null }) {
  const text = value || "";
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <CopyAction
          label={`Copiar ${title.toLocaleLowerCase("pt-BR")}`}
          value={text}
          onCopy={async (content) => {
            await navigator.clipboard.writeText(content);
            toast.success(`${title} copiada`);
          }}
        />
      </div>
      <ExpandableText value={text} lines={6} className="md:hidden" />
      <p className="mt-2 hidden max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground md:block">
        {text || "Não disponível"}
      </p>
      <p className="mt-1 text-right text-xs text-muted-foreground">
        {text.length} caracteres
      </p>
    </div>
  );
}

function ResponsiveSection({
  title,
  summary,
  defaultOpen = false,
  actions,
  children,
}: {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-14 items-center gap-1 p-2 pl-3 md:min-h-0 md:p-5">
        <button
          type="button"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:hidden"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((current) => !current)}
        >
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-semibold tracking-tight md:text-lg">
              {title}
            </h2>
            {summary && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {summary}
              </p>
            )}
          </div>
          <ChevronDown
            size={18}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform md:hidden",
              open && "rotate-180",
            )}
          />
        </button>
        <div className="hidden min-w-0 flex-1 md:block">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {summary && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0">{actions}</div>}
      </div>
      <div
        id={contentId}
        className={cn(
          "border-t border-border/70",
          open ? "block" : "hidden",
          "md:block",
        )}
      >
        <CardContent className="p-3 md:p-5">{children}</CardContent>
      </div>
    </Card>
  );
}

function CopyAction({
  label,
  value,
  onCopy,
  className,
}: {
  label: string;
  value?: string | null;
  onCopy: (value: string) => void | Promise<void>;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("size-11 md:size-10", className)}
      aria-label={label}
      title={label}
      disabled={!value}
      onClick={() => {
        if (value) void onCopy(value);
      }}
    >
      <Clipboard size={18} />
    </Button>
  );
}

function ExpandableText({
  value,
  lines,
  className,
}: {
  value?: string | null;
  lines: 4 | 6;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = value || "";
  const canExpand = text.length > (lines === 4 ? 180 : 320);
  return (
    <div className={className}>
      <p
        data-testid={canExpand ? "scrollable-text" : undefined}
        tabIndex={canExpand && !expanded ? 0 : undefined}
        aria-label={canExpand && !expanded ? "Texto completo rolável" : undefined}
        className={cn(
          "whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-sm leading-relaxed text-foreground",
          !expanded &&
            "touch-pan-y overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
          !expanded && lines === 4 && "max-h-28",
          !expanded && lines === 6 && "max-h-44",
          !text && "text-muted-foreground",
        )}
      >
        {text || "Não disponível"}
      </p>
      {canExpand && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 min-h-11 px-2 text-primary"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? "Ver menos" : "Ver mais"}
        </Button>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
