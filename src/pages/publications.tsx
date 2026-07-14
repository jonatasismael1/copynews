import { useState } from "react";
import {
  Archive,
  ClipboardPaste,
  ExternalLink,
  History,
  Link2,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useCreatePublication,
  useLookups,
  useNews,
  usePublications,
  useRecordMetrics,
  useRefreshPublicationMetrics,
  type PublicationWithRelations,
} from "@/hooks/use-data";
import {
  metricSchema,
  publicationSchema,
  type MetricInput,
  type PublicationInput,
} from "@/lib/schemas";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

type Snapshot = Record<string, number | string>;
type Period = "today" | "yesterday" | "3days" | "7days" | "30days" | "custom";

export function PublicationsPage() {
  const { profile } = useAuth();
  const { data = [], isLoading, refetch } = usePublications();
  const { data: lookups } = useLookups();
  const [modal, setModal] = useState<"publication" | "metrics" | "detail" | null>(null);
  const [selected, setSelected] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const refreshMetrics = useRefreshPublicationMetrics();
  const range = publicationRange(period, customFrom, customTo);
  const visiblePublications = data.filter((publication) => {
    const publishedAt = new Date(publication.published_at).getTime();
    const matchesUser =
      userFilter === "all" ||
      publication.created_by === userFilter ||
      publication.posted_by === userFilter;
    return matchesUser && publishedAt >= range.from && publishedAt < range.to;
  });
  const selectedPublication = data.find((publication) => publication.id === selected);

  async function syncConnectedInstagram() {
    setSyncingAll(true);
    const { data: result, error } = await supabase.functions.invoke(
      "sync-instagram-publications",
      { body: profile?.role === "admin" ? { sync_all: true } : {} },
    );
    setSyncingAll(false);
    if (error) return toast.error("Não foi possível atualizar o Instagram");
    await refetch();
    toast.success(
      `${Number(result?.imported || 0)} publicação(ões) sincronizada(s)`,
    );
  }

  async function managePublication(
    publicationId: string,
    action: "archive" | "delete",
  ) {
    const message =
      action === "archive"
        ? "Arquivar esta publicação?"
        : "Excluir permanentemente esta publicação e suas métricas?";
    if (!window.confirm(message)) return;
    const { error } = await supabase.functions.invoke("manage-publications", {
      body: { action, publication_id: publicationId },
    });
    if (error)
      return toast.error(
        action === "archive"
          ? "Não foi possível arquivar a publicação"
          : "Não foi possível excluir a publicação",
      );
    toast.success(
      action === "archive" ? "Publicação arquivada" : "Publicação excluída",
    );
    refetch();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary">Distribuição</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h1 className="font-display text-3xl font-bold">Publicações</h1>
            <Button
              variant="outline"
              className="shrink-0"
              disabled={syncingAll}
              onClick={syncConnectedInstagram}
            >
              <RefreshCw className={syncingAll ? "animate-spin" : ""} />
              Atualizar
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Registros vinculados e externos, com snapshots preservados.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[220px_auto]">
          {profile?.role === "admin" && (
            <select
              aria-label="Filtrar publicações por usuário"
              className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
              value={userFilter}
              onChange={(event) => setUserFilter(event.target.value)}
            >
              <option value="all">Todos os usuários</option>
              {(lookups?.profiles ?? []).map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          )}
          <Button onClick={() => setModal("publication")}>
            <Plus />
            Adicionar publicação
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {([
              ["today", "Hoje"],
              ["yesterday", "Ontem"],
              ["3days", "3 dias"],
              ["7days", "7 dias"],
              ["30days", "30 dias"],
              ["custom", "Personalizado"],
            ] as const).map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                className="shrink-0"
                variant={period === value ? "default" : "outline"}
                onClick={() => setPeriod(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {period === "custom" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Data inicial" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
              <Input aria-label="Data final" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
            </div>
          )}
          <p className="text-sm font-semibold">
            {visiblePublications.length} publicação(ões) no período
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : visiblePublications.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <h2 className="font-display text-lg font-semibold">
                Nenhuma publicação registrada
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Publicações externas também contam no dashboard.
              </p>
            </CardContent>
          </Card>
        ) : (
          visiblePublications.map((publication) => {
            const sorted = [...(publication.metric_snapshots ?? [])].sort(
              (a, b) =>
                String(b.captured_at).localeCompare(String(a.captured_at)),
            );
            const latest = sorted[0];
            const canManage =
              profile?.role === "admin" ||
              publication.created_by === profile?.id ||
              publication.posted_by === profile?.id;
            return (
              <Card key={publication.id} className="max-w-full overflow-hidden">
                <CardContent className="min-w-0 p-4">
                  <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{publication.platform}</Badge>
                        <Badge variant="outline">
                          {publication.source_type === "external"
                            ? "Externa"
                            : "Copy News"}
                        </Badge>
                      </div>
                      <button
                        type="button"
                        data-testid="publication-detail"
                        className="mt-3 block w-full truncate text-left font-display font-semibold hover:text-primary hover:underline"
                        onClick={() => {
                          setSelected(publication.id);
                          setModal("detail");
                        }}
                      >
                        {publication.title}
                      </button>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(publication.published_at)} •{" "}
                        {publication.pages?.name || "Sem página"}
                      </p>
                      <a
                        className="mt-1 hidden truncate text-xs text-primary hover:underline sm:block"
                        href={publication.published_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {publication.published_url}
                      </a>
                      {publication.caption && (
                        <p className="mt-3 hidden line-clamp-2 whitespace-pre-line text-sm text-muted-foreground sm:block">
                          {publication.caption}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-3 text-sm md:min-w-72">
                      <Stat label="Views" value={number(latest?.views)} />
                      <Stat label="Curtidas" value={number(latest?.likes)} />
                      <Stat label="Comentários" value={number(latest?.comments)} />
                      <div className="hidden sm:block"><Stat label="Compart." value={number(latest?.shares)} /></div>
                      <div className="hidden sm:block"><Stat label="Salvos" value={number(latest?.saves)} /></div>
                      <div className="hidden sm:block"><Stat label="Reposts" value={number(latest?.reposts)} /></div>
                    </div>
                    <div className="flex w-full flex-wrap justify-end gap-2 border-t pt-3 md:w-auto md:shrink-0 md:border-l md:border-t-0 md:pl-3 md:pt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          refreshMetrics.isPending &&
                          refreshMetrics.variables === publication.id
                        }
                        onClick={() => refreshMetrics.mutate(publication.id)}
                      >
                        <RefreshCw
                          className={
                            refreshMetrics.isPending &&
                            refreshMetrics.variables === publication.id
                              ? "animate-spin"
                              : ""
                          }
                        />
                        Atualizar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelected(publication.id);
                          setModal("metrics");
                        }}
                      >
                        <TrendingUp />
                        Métricas
                      </Button>
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={publication.published_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Abrir publicação"
                        >
                          <ExternalLink />
                        </a>
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Arquivar publicação"
                            onClick={() =>
                              managePublication(publication.id, "archive")
                            }
                          >
                            <Archive />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            title="Excluir publicação"
                            onClick={() =>
                              managePublication(publication.id, "delete")
                            }
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="hidden sm:block"><MetricHistory snapshots={sorted} /></div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
      {modal === "publication" && (
        <PublicationModal close={() => setModal(null)} />
      )}
      {modal === "metrics" && (
        <MetricsModal publicationId={selected} close={() => setModal(null)} />
      )}
      {modal === "detail" && selectedPublication && (
        <PublicationDetails
          publication={selectedPublication}
          close={() => setModal(null)}
          refresh={() => refreshMetrics.mutate(selectedPublication.id)}
          addMetrics={() => setModal("metrics")}
        />
      )}
    </div>
  );
}

function PublicationDetails({
  publication,
  close,
  refresh,
  addMetrics,
}: {
  publication: PublicationWithRelations;
  close: () => void;
  refresh: () => void;
  addMetrics: () => void;
}) {
  const snapshots = [...(publication.metric_snapshots ?? [])].sort((a, b) =>
    String(b.captured_at).localeCompare(String(a.captured_at)),
  );
  const latest = snapshots[0];
  return (
    <Overlay close={close}>
      <div className="space-y-5">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge>{publication.platform}</Badge>
            <Badge variant="outline">{publication.source_type === "external" ? "Externa" : "Copy News"}</Badge>
          </div>
          <h2 className="mt-3 font-display text-xl font-bold">{publication.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(publication.published_at)} • {publication.pages?.name || "Sem página"}
          </p>
        </div>
        <a className="flex min-w-0 items-center gap-2 rounded-xl border p-3 text-sm text-primary hover:bg-muted" href={publication.published_url} target="_blank" rel="noreferrer">
          <ExternalLink className="shrink-0" size={17} />
          <span className="min-w-0 truncate">{publication.published_url}</span>
        </a>
        {publication.caption && (
          <div>
            <p className="mb-2 text-sm font-semibold">Legenda</p>
            <p className="max-h-52 overflow-y-auto whitespace-pre-line rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">{publication.caption}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Views" value={number(latest?.views)} />
          <Stat label="Curtidas" value={number(latest?.likes)} />
          <Stat label="Comentários" value={number(latest?.comments)} />
          <Stat label="Compart." value={number(latest?.shares)} />
          <Stat label="Salvos" value={number(latest?.saves)} />
          <Stat label="Reposts" value={number(latest?.reposts)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={refresh}><RefreshCw /> Atualizar</Button>
          <Button variant="outline" onClick={addMetrics}><TrendingUp /> Métricas</Button>
        </div>
        <MetricHistory snapshots={snapshots} />
        <Button className="w-full" onClick={close}>Fechar</Button>
      </div>
    </Overlay>
  );
}

function MetricHistory({ snapshots }: { snapshots: Snapshot[] }) {
  if (!snapshots.length)
    return (
      <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
        Nenhuma métrica registrada.
      </p>
    );
  const current = snapshots[0];
  const previous = snapshots[1];
  const variation = previous
    ? number(current.views) - number(previous.views)
    : null;
  return (
    <details className="mt-4 border-t pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
        <History size={16} />
        Histórico de métricas{" "}
        <Badge variant="outline">{snapshots.length}</Badge>
        {variation !== null && (
          <span
            className={
              variation >= 0
                ? "ml-auto text-emerald-600"
                : "ml-auto text-red-600"
            }
          >
            {variation >= 0 ? "+" : ""}
            {variation.toLocaleString("pt-BR")} views
          </span>
        )}
      </summary>
      <div className="mt-3 overflow-x-auto rounded-xl border">
        <div className="grid min-w-[720px] grid-cols-[1.4fr_repeat(6,auto)] gap-4 bg-muted/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          <span>Coleta</span>
          <span>Views</span>
          <span>Curtidas</span>
          <span>Comentários</span>
          <span>Compart.</span>
          <span>Salvos</span>
          <span>Reposts</span>
        </div>
        {snapshots.map((snapshot, index) => (
          <div
            key={String(snapshot.id ?? snapshot.captured_at)}
            className="grid min-w-[720px] grid-cols-[1.4fr_repeat(6,auto)] gap-4 border-t px-3 py-2 text-xs"
          >
            <span>
              {formatDate(String(snapshot.captured_at))}
              {index === 0 && (
                <Badge className="ml-2" variant="success">
                  Atual
                </Badge>
              )}
              <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                {snapshot.source === "api" ? "Instagram" : "Manual"}
              </span>
            </span>
            <b>{number(snapshot.views).toLocaleString("pt-BR")}</b>
            <b>{number(snapshot.likes).toLocaleString("pt-BR")}</b>
            <b>{number(snapshot.comments).toLocaleString("pt-BR")}</b>
            <b>{number(snapshot.shares).toLocaleString("pt-BR")}</b>
            <b>{number(snapshot.saves).toLocaleString("pt-BR")}</b>
            <b>{number(snapshot.reposts).toLocaleString("pt-BR")}</b>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Coletas da API e inserções manuais permanecem registradas.
      </p>
    </details>
  );
}

function PublicationModal({ close }: { close: () => void }) {
  const { data: lookups } = useLookups();
  const { data: news = [] } = useNews();
  const mutation = useCreatePublication();
  const [publishedUrl, setPublishedUrl] = useState("");
  const [newsItemId, setNewsItemId] = useState("");
  const [pageId, setPageId] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [metadata, setMetadata] = useState<{
    title: string;
    caption: string | null;
    author: string | null;
    platform: string;
    published_at: string;
  } | null>(null);

  async function inspect() {
    const parsed = publicationSchema.safeParse({
      published_url: publishedUrl,
      news_item_id: newsItemId || null,
      page_id: pageId || null,
    });
    if (!parsed.success) return toast.error("Informe um link válido");
    setInspecting(true);
    const { data, error } = await supabase.functions.invoke(
      "inspect-publication-url",
      { body: { published_url: publishedUrl } },
    );
    setInspecting(false);
    if (error) return toast.error("Não foi possível ler esta publicação");
    setMetadata(data);
  }

  async function pastePublicationUrl() {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) return toast.error("A área de transferência está vazia");
      setPublishedUrl(value);
      setMetadata(null);
    } catch {
      toast.error("Permita o acesso à área de transferência ou cole manualmente");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const values: PublicationInput = {
      published_url: publishedUrl,
      news_item_id: newsItemId || null,
      page_id: pageId || null,
    };
    const parsed = publicationSchema.safeParse(values);
    if (!parsed.success) return toast.error("Informe um link válido");
    await mutation.mutateAsync(parsed.data);
    close();
  }

  return (
    <Overlay close={close}>
      <form className="space-y-4" onSubmit={submit}>
        <h2 className="font-display text-xl font-bold">Adicionar publicação</h2>
        <p className="text-sm text-muted-foreground">
          Cole o link. O Copy News buscará legenda, autor, plataforma, data e
          hora reais da publicação.
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Link da publicação"
            inputMode="url"
            placeholder="https://instagram.com/reel/..."
            value={publishedUrl}
            onChange={(event) => {
              setPublishedUrl(event.target.value);
              setMetadata(null);
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={inspect}
            disabled={inspecting}
          >
            {inspecting ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            <span className="hidden sm:inline">Ler publicação</span>
          </Button>
        </div>
        <Button
          className="w-full sm:w-auto"
          type="button"
          variant="outline"
          onClick={pastePublicationUrl}
        >
          <ClipboardPaste />
          Colar texto copiado
        </Button>
        {metadata && (
          <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-primary">
              <span>{metadata.platform}</span>
              <span>•</span>
              <span>{formatDate(metadata.published_at)}</span>
            </div>
            <p className="mt-2 font-semibold">{metadata.title}</p>
            {metadata.author && (
              <p className="mt-1 text-xs text-muted-foreground">
                Por {metadata.author}
              </p>
            )}
            {metadata.caption && (
              <p className="mt-3 max-h-32 overflow-y-auto whitespace-pre-line text-sm text-muted-foreground">
                {metadata.caption}
              </p>
            )}
          </div>
        )}
        <details className="rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Vincular ao Copy News (opcional)
          </summary>
          <div className="mt-4 grid gap-4">
            <Field label="Notícia vinculada">
              <select
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={newsItemId}
                onChange={(event) => {
                  setNewsItemId(event.target.value);
                  const item = news.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (item?.destination_page_id)
                    setPageId(item.destination_page_id);
                }}
              >
                <option value="">Publicação externa</option>
                {news.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.generated_title || item.source_url}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Página">
              <select
                className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                value={pageId}
                onChange={(event) => setPageId(event.target.value)}
              >
                <option value="">Sem página</option>
                {lookups?.pages.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={mutation.isPending || inspecting}>
            {mutation.isPending ? "Lendo e registrando..." : "Registrar"}
          </Button>
        </div>
      </form>
    </Overlay>
  );
}

function MetricsModal({
  publicationId,
  close,
}: {
  publicationId: string;
  close: () => void;
}) {
  const mutation = useRecordMetrics();
  const { register, handleSubmit } = useForm<MetricInput>({
    resolver: zodResolver(metricSchema),
    defaultValues: {
      publication_id: publicationId,
      captured_at: new Date().toISOString().slice(0, 16),
      views: 0,
      reach: 0,
      impressions: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      reposts: 0,
      clicks: 0,
      followers_gained: 0,
    },
  });
  async function submit(values: MetricInput) {
    await mutation.mutateAsync(values);
    close();
  }
  return (
    <Overlay close={close}>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <h2 className="font-display text-xl font-bold">Novo snapshot</h2>
        <p className="text-sm text-muted-foreground">
          Os valores anteriores serão preservados.
        </p>
        <Field label="Data da coleta">
          <Input type="datetime-local" {...register("captured_at")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              "views",
              "reach",
              "impressions",
              "likes",
              "comments",
              "shares",
              "saves",
              "reposts",
              "clicks",
              "followers_gained",
            ] as const
          ).map((name) => (
            <Field
              key={name}
              label={
                {
                  views: "Visualizações",
                  reach: "Alcance",
                  impressions: "Impressões",
                  likes: "Curtidas",
                  comments: "Comentários",
                  shares: "Compartilhamentos",
                  saves: "Salvamentos",
                  reposts: "Reposts",
                  clicks: "Cliques",
                  followers_gained: "Seguidores ganhos",
                }[name]
              }
            >
              <Input
                type="number"
                min="0"
                {...register(name, { valueAsNumber: true })}
              />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={mutation.isPending}>Salvar snapshot</Button>
        </div>
      </form>
    </Overlay>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-bold">
        {value.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
function number(value: unknown) {
  return Number(value ?? 0);
}
function publicationRange(period: Period, customFrom: string, customTo: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  let from = new Date(today);
  let to = new Date(tomorrow);
  if (period === "yesterday") {
    from.setDate(from.getDate() - 1);
    to = new Date(today);
  } else if (period === "3days") from.setDate(from.getDate() - 2);
  else if (period === "7days") from.setDate(from.getDate() - 6);
  else if (period === "30days") from.setDate(from.getDate() - 29);
  else if (period === "custom") {
    if (customFrom) from = new Date(`${customFrom}T00:00:00`);
    if (customTo) {
      to = new Date(`${customTo}T00:00:00`);
      to.setDate(to.getDate() + 1);
    }
  }
  return { from: from.getTime(), to: to.getTime() };
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Maceio",
  }).format(new Date(value));
}
function Overlay({
  children,
  close,
}: {
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
      onClick={close}
    >
      <Card
        className="max-h-[90dvh] w-full overflow-y-auto rounded-b-none p-5 sm:max-w-xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </Card>
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
