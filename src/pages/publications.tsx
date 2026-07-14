import { useState } from "react";
import { ExternalLink, History, Plus, TrendingUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import {
  useCreatePublication,
  useLookups,
  useNews,
  usePublications,
  useRecordMetrics,
} from "@/hooks/use-data";
import {
  metricSchema,
  publicationSchema,
  type MetricInput,
  type PublicationInput,
} from "@/lib/schemas";

type Snapshot = Record<string, number | string>;

export function PublicationsPage() {
  const { data = [], isLoading } = usePublications();
  const [modal, setModal] = useState<"publication" | "metrics" | null>(null);
  const [selected, setSelected] = useState("");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Distribuição</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Publicações</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Registros vinculados e externos, com snapshots preservados.
          </p>
        </div>
        <Button onClick={() => setModal("publication")}>
          <Plus />
          Adicionar publicação
        </Button>
      </div>
      <div className="grid gap-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : data.length === 0 ? (
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
          data.map((publication) => {
            const sorted = [...(publication.metric_snapshots ?? [])].sort(
              (a, b) =>
                String(b.captured_at).localeCompare(String(a.captured_at)),
            );
            const latest = sorted[0];
            return (
              <Card key={publication.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{publication.platform}</Badge>
                        <Badge variant="outline">
                          {publication.source_type === "external"
                            ? "Externa"
                            : "Copy News"}
                        </Badge>
                      </div>
                      <h2 className="mt-3 truncate font-display font-semibold">
                        {publication.title}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(publication.published_at)} •{" "}
                        {publication.pages?.name || "Sem página"}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm md:flex md:gap-8">
                      <Stat
                        label="Visualizações"
                        value={number(latest?.views)}
                      />
                      <Stat label="Interações" value={interactions(latest)} />
                    </div>
                    <div className="flex gap-2">
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
                    </div>
                  </div>
                  <MetricHistory snapshots={sorted} />
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
    </div>
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
      <div className="mt-3 overflow-hidden rounded-xl border">
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-muted/60 px-3 py-2 text-[11px] font-semibold text-muted-foreground">
          <span>Coleta</span>
          <span>Views</span>
          <span>Interações</span>
        </div>
        {snapshots.map((snapshot, index) => (
          <div
            key={String(snapshot.id ?? snapshot.captured_at)}
            className="grid grid-cols-[1fr_auto_auto] gap-3 border-t px-3 py-2 text-xs"
          >
            <span>
              {formatDate(String(snapshot.captured_at))}
              {index === 0 && (
                <Badge className="ml-2" variant="success">
                  Atual
                </Badge>
              )}
            </span>
            <b>{number(snapshot.views).toLocaleString("pt-BR")}</b>
            <b>{interactions(snapshot).toLocaleString("pt-BR")}</b>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Fonte manual. Cada coleta permanece registrada.
      </p>
    </details>
  );
}

function PublicationModal({ close }: { close: () => void }) {
  const { data: lookups } = useLookups();
  const { data: news = [] } = useNews();
  const mutation = useCreatePublication();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<PublicationInput>({
    resolver: zodResolver(publicationSchema),
    defaultValues: {
      news_item_id: null,
      page_id: null,
      posted_by: null,
      published_at: new Date().toISOString().slice(0, 16),
    },
  });
  const newsField = register("news_item_id");

  async function submit(values: PublicationInput) {
    await mutation.mutateAsync(values);
    close();
  }

  return (
    <Overlay close={close}>
      <form className="space-y-4" onSubmit={handleSubmit(submit)}>
        <h2 className="font-display text-xl font-bold">Adicionar publicação</h2>
        <p className="text-sm text-muted-foreground">
          Vincule uma notícia do Copy News ou registre conteúdo externo.
        </p>
        <Field label="Notícia vinculada">
          <select
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            {...newsField}
            onChange={(event) => {
              newsField.onChange(event);
              const item = news.find(
                (candidate) => candidate.id === event.target.value,
              );
              if (item) {
                setValue("title", item.generated_title ?? "", {
                  shouldValidate: true,
                });
                setValue("caption", item.generated_caption ?? "");
                setValue("page_id", item.destination_page_id ?? null);
              }
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
        <label className="block">
          <span className="label">Título *</span>
          <Input {...register("title")} />
          {errors.title && (
            <small className="text-destructive">{errors.title.message}</small>
          )}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Plataforma *">
            <Input placeholder="Instagram" {...register("platform")} />
          </Field>
          <Field label="Data e hora *">
            <Input type="datetime-local" {...register("published_at")} />
          </Field>
        </div>
        <Field label="URL publicada *">
          <Input inputMode="url" {...register("published_url")} />
        </Field>
        <Field label="Página">
          <select
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            {...register("page_id")}
          >
            <option value="">Sem página</option>
            {lookups?.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsável">
          <select
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            {...register("posted_by")}
          >
            <option value="">Usuário atual</option>
            {lookups?.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Legenda">
          <Textarea {...register("caption")} />
        </Field>
        <Field label="Créditos">
          <Input {...register("credit_text")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button disabled={mutation.isPending}>Registrar</Button>
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
function interactions(snapshot?: Snapshot) {
  return (
    number(snapshot?.likes) +
    number(snapshot?.comments) +
    number(snapshot?.shares) +
    number(snapshot?.saves)
  );
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
