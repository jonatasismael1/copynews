import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Clipboard,
  Download,
  Archive,
  History,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useLookups, useNewsItem } from "@/hooks/use-data";
import { supabase } from "@/lib/supabase";
import { statusLabels, type NewsStatus } from "@/lib/constants";
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

export function NewsDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: lookups } = useLookups();
  const { data, isLoading, refetch } = useNewsItem(id);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState<NewsStatus>("processing");
  const [assignedTo, setAssignedTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [destinationPageId, setDestinationPageId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [revision, setRevision] = useState<{
    field: "title" | "caption";
    instruction: string;
    preview?: string;
  } | null>(null);
  const lastSaved = useRef("");

  function signature() {
    return JSON.stringify([
      title,
      caption,
      status,
      assignedTo,
      categoryId,
      destinationPageId,
      scheduledAt,
    ]);
  }

  useEffect(() => {
    if (!data) return;
    const nextTitle = data.generated_title ?? "";
    const nextCaption = data.generated_caption ?? "";
    const nextStatus = data.status as NewsStatus;
    const nextAssigned = data.assigned_to ?? "";
    const nextCategory = data.category_id ?? "";
    const nextDestination = data.destination_page_id ?? "";
    const nextSchedule = toMaceioInput(data.scheduled_at);
    // Query hydration is the single source of the initial editable draft.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(nextTitle);
    setCaption(nextCaption);
    setStatus(nextStatus);
    setAssignedTo(nextAssigned);
    setCategoryId(nextCategory);
    setDestinationPageId(nextDestination);
    setScheduledAt(nextSchedule);
    lastSaved.current = JSON.stringify([
      nextTitle,
      nextCaption,
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
    if (!data || signature() === lastSaved.current) return;
    const timer = setTimeout(() => persist(false), 1200);
    return () => clearTimeout(timer);
    // persist is deliberately driven only by editable field values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    caption,
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

  async function persist(showToast: boolean) {
    if (!data || saving) return;
    if (status === "scheduled" && !scheduledAt) {
      if (showToast) toast.error("Informe a data do agendamento.");
      return;
    }
    if (status === "published" && !hasPublication) {
      if (showToast)
        toast.error(
          "Registre uma publicação vinculada antes de marcar como publicada.",
        );
      return;
    }
    setSaving(true);
    const savedSignature = signature();
    const values = {
      generated_title: title,
      generated_caption: caption,
      status,
      ...(profile?.role === "admin"
        ? { assigned_to: assignedTo || null }
        : {}),
      category_id: categoryId || null,
      destination_page_id: destinationPageId || null,
      scheduled_at:
        status === "scheduled" && scheduledAt
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
    lastSaved.current = savedSignature;
    setSavedAt(new Date());
    await refetch();
    if (showToast) toast.success("Alterações salvas");
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado para a área de transferência");
  }

  async function signedDownload() {
    const { data: result, error } = await supabase.functions.invoke(
      "temporary-media-url",
      { body: { news_item_id: data.id } },
    );
    if (error) return toast.error("A mídia não está mais disponível");
    window.open(result.url, "_blank");
  }

  async function revise() {
    if (!revision) return;
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {data.source_url}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {saving
              ? "Salvando…"
              : savedAt
                ? `Salvo às ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Autosave ativo"}
          </span>
          <Button
            variant="outline"
            onClick={signedDownload}
            disabled={!data.temporary_media_path}
          >
            <Download />
            Baixar vídeo
          </Button>
          <Button onClick={() => persist(true)} disabled={saving}>
            <Check />
            Salvar agora
          </Button>
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

      <Card>
        <CardHeader>
          <CardTitle>Fluxo editorial</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          {status === "scheduled" && (
            <Field label="Agendar para">
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {(
          [
            ["title", "Título", title, setTitle],
            ["caption", "Legenda", caption, setCaption],
          ] as const
        ).map(([field, label, value, setter]) => (
          <Card key={field}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{label}</CardTitle>
              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copy(value)}
                  aria-label={`Copiar ${label}`}
                >
                  <Clipboard />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRevision({ field, instruction: "" })}
                  aria-label={`Alterar ${label} com IA`}
                >
                  <Sparkles />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                className={field === "caption" ? "min-h-64" : "min-h-28"}
                value={value}
                onChange={(event) => setter(event.target.value)}
              />
              <p className="mt-2 text-right text-xs text-muted-foreground">
                {value.length} caracteres
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History />
            Fontes e rastreabilidade
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <Source title="Legenda original" value={data.source_caption} />
          <Source title="Transcrição" value={data.transcript} />
          <Source title="Texto detectado por OCR" value={data.ocr_text} />
          <Source title="Alertas da IA" value={data.ai_warnings?.join("\n")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico editorial</CardTitle>
        </CardHeader>
        <CardContent>
          {data.news_versions?.length || data.status_history?.length ? (
            <div className="space-y-3">
              {[
                ...(data.news_versions ?? []).map(
                  (item: Record<string, string>) => ({
                    at: item.created_at,
                    text: `${item.field === "title" ? "Título" : "Legenda"} alterado (${item.change_type})`,
                  }),
                ),
                ...(data.status_history ?? []).map(
                  (item: Record<string, string>) => ({
                    at: item.created_at,
                    text: `Status: ${item.from_status ? statusLabels[item.from_status as NewsStatus] : "inicial"} → ${statusLabels[item.to_status as NewsStatus]}`,
                  }),
                ),
              ]
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 10)
                .map((item) => (
                  <div
                    key={`${item.at}-${item.text}`}
                    className="flex gap-3 border-b pb-3 text-sm last:border-0"
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
        </CardContent>
      </Card>

      {revision && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setRevision(null)}
        >
          <Card
            className="max-h-[88dvh] w-full overflow-y-auto rounded-b-none p-1 sm:max-w-lg sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader>
              <CardTitle>
                Alterar {revision.field === "title" ? "título" : "legenda"} com
                IA
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                A IA criará uma prévia. O texto só será substituído após sua
                confirmação.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    disabled={!revision.instruction}
                  >
                    <Sparkles />
                    Gerar prévia
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
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function toMaceioInput(value?: string | null) {
  if (!value) return "";
  return new Date(new Date(value).getTime() - 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

function Source({ title, value }: { title: string; value?: string | null }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
        {value || "Não disponível"}
      </p>
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
