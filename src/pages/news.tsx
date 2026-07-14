import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Columns3,
  LayoutList,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNews } from "@/hooks/use-data";
import { statusLabels, type NewsStatus } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const variant = (status: NewsStatus) =>
  status === "published" || status === "approved"
    ? "success"
    : status === "failed" || status === "changes_requested"
      ? "danger"
      : status === "awaiting_approval" || status === "scheduled"
        ? "warning"
        : "secondary";

export function NewsPage() {
  const { profile } = useAuth();
  const { data = [], isLoading, refetch } = useNews();
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [clearing, setClearing] = useState(false);
  const filtered = useMemo(
    () =>
      data.filter((news) =>
        `${news.generated_title ?? ""} ${news.source_url}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [data, search],
  );
  const columns: NewsStatus[] = [
    "draft",
    "awaiting_approval",
    "changes_requested",
    "approved",
    "scheduled",
    "published",
  ];

  async function clearAll() {
    const confirmation = window.prompt(
      `Esta ação excluirá permanentemente todas as ${data.length} notícias e suas mídias temporárias. Digite EXCLUIR para continuar.`,
    );
    if (confirmation !== "EXCLUIR") return;
    setClearing(true);
    const { data: result, error } = await supabase.functions.invoke(
      "manage-news",
      { body: { action: "delete_all", confirmation: "EXCLUIR" } },
    );
    setClearing(false);
    if (error) return toast.error("Não foi possível limpar as notícias");
    if (result.media_cleanup_pending)
      toast.warning(
        `${result.deleted} notícias excluídas; a limpeza de algumas mídias será retomada.`,
      );
    else toast.success(`${result.deleted} notícias excluídas`);
    refetch();
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Fluxo editorial</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Notícias</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gerencie cada etapa da produção.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {profile?.role === "admin" && (
            <Button
              variant="destructive"
              onClick={clearAll}
              disabled={clearing || data.length === 0}
            >
              <Trash2 />
              {clearing ? "Limpando..." : "Limpar todas"}
            </Button>
          )}
          <Button asChild>
            <Link to="/criar">
              <Plus />
              Nova notícia
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-3.5 text-muted-foreground"
            size={17}
          />
          <Input
            className="pl-10"
            placeholder="Buscar por título ou link..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex rounded-xl border bg-card p-1">
          <Button
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
            onClick={() => setView("list")}
          >
            <LayoutList />
            Lista
          </Button>
          <Button
            size="sm"
            variant={view === "kanban" ? "secondary" : "ghost"}
            onClick={() => setView("kanban")}
          >
            <Columns3 />
            Kanban
          </Button>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center py-16 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-muted">
              <AlertCircle className="text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold">
              Nenhuma notícia encontrada
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Comece processando um link de origem.
            </p>
            <Button className="mt-5" asChild>
              <Link to="/criar">Criar notícia</Link>
            </Button>
          </CardContent>
        </Card>
      ) : view === "list" ? (
        <div className="space-y-3">
          {filtered.map((item) => {
            const job = item.processing_jobs?.[0];
            return (
              <Link
                to={`/noticias/${item.id}`}
                key={item.id}
                className="block"
              >
                <Card className="transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
                  <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={variant(item.status)}>
                          {statusLabels[item.status]}
                        </Badge>
                        {item.categories && (
                          <Badge variant="outline">
                            {item.categories.name}
                          </Badge>
                        )}
                      </div>
                      <h2 className="mt-3 truncate font-display text-base font-semibold">
                        {item.generated_title || "Notícia em processamento"}
                      </h2>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.source_url}
                      </p>
                      {job && job.status !== "completed" && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                job.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-primary",
                              )}
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {job.status === "running" && (
                              <LoaderCircle
                                size={12}
                                className="animate-spin"
                              />
                            )}
                            {job.progress}%
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">
                          Responsável
                        </p>
                        <p className="mt-1 text-sm font-medium">
                          {item.profiles?.name || "Não atribuído"}
                        </p>
                      </div>
                      <ArrowRight className="text-muted-foreground" size={18} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex snap-x gap-4 overflow-x-auto pb-4">
          {columns.map((column) => (
            <div
              key={column}
              className="w-[82vw] shrink-0 snap-start sm:w-80"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{statusLabels[column]}</h2>
                <Badge variant="outline">
                  {filtered.filter((item) => item.status === column).length}
                </Badge>
              </div>
              <div className="space-y-3">
                {filtered
                  .filter((item) => item.status === column)
                  .map((item) => (
                    <Link key={item.id} to={`/noticias/${item.id}`}>
                      <Card className="mb-3 hover:border-primary/30">
                        <CardContent className="p-4">
                          <h3 className="line-clamp-2 text-sm font-semibold">
                            {item.generated_title ||
                              "Notícia em processamento"}
                          </h3>
                          <p className="mt-3 text-xs text-muted-foreground">
                            {item.profiles?.name || "Não atribuído"}
                          </p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
