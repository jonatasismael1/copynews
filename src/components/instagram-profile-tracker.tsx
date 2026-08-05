import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Download, ExternalLink, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export type TrackedInstagramProfile = {
  id: string;
  username: string;
  display_name: string | null;
  profile_url: string;
  avatar_url: string | null;
  followers_count: number | null;
  following_count: number | null;
  media_count: number | null;
  last_sync_at: string | null;
  last_sync_status: "pending" | "success" | "error";
  last_error: string | null;
  is_fixed: boolean;
};

type DailyReportRow = {
  tracked_profile_id: string;
  username: string;
  display_name: string | null;
  report_date: string;
  posts_count: number;
  views: number;
  likes: number;
  comments: number;
  reach: number | null;
  shares: number | null;
  last_sync_at: string;
};

type TrackedPublication = {
  tracked_profile_id?: string | null;
  published_at: string;
};

type Props = {
  publications: TrackedPublication[];
  selectedProfile: string;
  syncStartDate: string;
  syncEndDate: string;
  onSelectProfile: (profileId: string) => void;
  onSynced: () => Promise<unknown> | unknown;
};

function todayKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("pt-BR");
}

function lastSevenDays() {
  const dates: string[] = [];
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dates.push(todayKey(date));
  }
  return dates;
}

function csvValue(value: unknown) {
  const text = value === null || value === undefined ? "N/D" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadWeeklyReport(rows: DailyReportRow[], profiles: TrackedInstagramProfile[]) {
  const dates = lastSevenDays();
  const lines = [[
    "Data",
    "Perfil",
    "Publicações",
    "Visualizações",
    "Curtidas",
    "Comentários",
    "Alcance",
    "Compartilhamentos",
  ].map(csvValue).join(";")];
  for (const date of dates) {
    for (const profile of profiles) {
      const row = rows.find((item) =>
        item.report_date === date && item.tracked_profile_id === profile.id
      );
      lines.push([
        date.split("-").reverse().join("/"),
        `@${profile.username}`,
        row?.posts_count ?? 0,
        row?.views ?? 0,
        row?.likes ?? 0,
        row?.comments ?? 0,
        row?.reach ?? null,
        row?.shares ?? null,
      ].map(csvValue).join(";"));
    }
  }
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `relatorio-instagram-${dates[0]}-a-${dates.at(-1)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function functionError(error: unknown) {
  let detail = error instanceof Error ? error.message : "Não foi possível sincronizar o perfil";
  try {
    const response = (error as { context?: Response }).context;
    const payload = await response?.clone().json();
    if (payload?.error) detail = String(payload.error);
  } catch {
    // Keep the SDK error when the response body is unavailable.
  }
  return detail;
}

export function InstagramProfileTracker({
  publications,
  selectedProfile,
  syncStartDate,
  syncEndDate,
  onSelectProfile,
  onSynced,
}: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["tracked-instagram-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracked_instagram_profiles")
        .select("*")
        .order("username");
      if (error) throw error;
      return data as TrackedInstagramProfile[];
    },
  });
  const weekDates = lastSevenDays();
  const { data: reportRows = [] } = useQuery({
    queryKey: ["instagram-daily-report", weekDates[0]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_daily_report")
        .select("*")
        .gte("report_date", weekDates[0])
        .lte("report_date", weekDates.at(-1)!)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data as DailyReportRow[];
    },
  });

  async function runSync(body: { profile?: string; profile_id?: string }) {
    let request: {
      profile?: string;
      profile_id?: string;
      start_date: string;
      end_date: string;
    } = { ...body, start_date: syncStartDate, end_date: syncEndDate };
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const { data, error } = await supabase.functions.invoke(
        "sync-instagram-profile",
        { body: request },
      );
      if (error) throw new Error(await functionError(error));
      if (!data?.pending) {
        return data as { profile: TrackedInstagramProfile; imported: number; posts_today: number };
      }
      request = {
        profile_id: String(data.profile.id),
        start_date: syncStartDate,
        end_date: syncEndDate,
      };
      await new Promise((resolve) => window.setTimeout(resolve, 8_000));
    }
    throw new Error("A Bright Data demorou mais de 8 minutos para concluir a consulta");
  }

  const sync = useMutation({
    mutationFn: runSync,
    onSuccess: async (result) => {
      setInput("");
      setShowForm(false);
      onSelectProfile(result.profile.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracked-instagram-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["publications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["instagram-daily-report"] }),
      ]);
      await onSynced();
      toast.success(
        `@${result.profile.username}: ${result.imported} publicação(ões) atualizadas`,
      );
    },
    onError: (error) => toast.error(
      error instanceof Error ? error.message : "Não foi possível sincronizar o perfil",
    ),
  });
  async function updateAllProfiles() {
    const fixedProfiles = profiles.filter((profile) => profile.is_fixed);
    if (!fixedProfiles.length) return;
    setSyncingAll(true);
    try {
      await Promise.all(fixedProfiles.map((profile) =>
        runSync({ profile_id: profile.id })
      ));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracked-instagram-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["publications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["instagram-daily-report"] }),
      ]);
      await onSynced();
      toast.success(`${fixedProfiles.length} perfis atualizados`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os perfis");
    } finally {
      setSyncingAll(false);
    }
  }
  const today = todayKey();

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-lg font-bold">Perfis acompanhados</p>
            <p className="text-sm text-muted-foreground">
              Cole @usuário, nome ou link do perfil para importar posts e métricas públicas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={syncingAll || !profiles.some((profile) => profile.is_fixed)}
              onClick={() => void updateAllProfiles()}
            >
              {syncingAll ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Atualizar todos agora
            </Button>
            <Button variant="outline" onClick={() => setShowForm((value) => !value)}>
              <Plus /> Acompanhar perfil
            </Button>
          </div>
        </div>

        {showForm && (
          <form
            className="flex flex-col gap-2 rounded-2xl border bg-muted/30 p-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (!input.trim()) return toast.error("Informe um perfil do Instagram");
              sync.mutate({ profile: input.trim() });
            }}
          >
            <Input
              aria-label="Perfil do Instagram"
              placeholder="@usuario ou https://instagram.com/usuario"
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
            <Button disabled={sync.isPending}>
              {sync.isPending ? <LoaderCircle className="animate-spin" /> : <AtSign />}
              Buscar publicações
            </Button>
          </form>
        )}

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            className={`min-w-36 rounded-2xl border p-3 text-left transition ${
              selectedProfile === "all" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
            onClick={() => onSelectProfile("all")}
          >
            <p className="text-xs text-muted-foreground">Todos os perfis</p>
            <p className="mt-1 text-xl font-bold">{profiles.length}</p>
          </button>
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando...</p>}
          {profiles.map((profile) => {
            const postsToday = reportRows.find((row) =>
              row.tracked_profile_id === profile.id && row.report_date === today
            )?.posts_count ?? publications.filter((publication) =>
              publication.tracked_profile_id === profile.id &&
              todayKey(new Date(publication.published_at)) === today
            ).length;
            return (
              <div
                role="button"
                tabIndex={0}
                key={profile.id}
                className={`min-w-64 rounded-2xl border p-3 text-left transition ${
                  selectedProfile === profile.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
                onClick={() => onSelectProfile(profile.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelectProfile(profile.id);
                }}
              >
                <div className="flex items-start gap-3">
                  {profile.avatar_url ? (
                    <img className="h-10 w-10 rounded-full object-cover" src={profile.avatar_url} alt="" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-muted"><AtSign size={18} /></div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">@{profile.username}</p>
                    {profile.is_fixed && <p className="text-[10px] font-semibold uppercase text-primary">Monitoramento diário</p>}
                    <p className="truncate text-xs text-muted-foreground">
                      {profile.display_name || `${formatNumber(profile.followers_count)} seguidores`}
                    </p>
                  </div>
                  <Badge variant={profile.last_sync_status === "error" ? "danger" : "outline"}>
                    {postsToday} hoje
                  </Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2 text-xs">
                  <span>{formatNumber(profile.followers_count)} seguidores</span>
                  <span className="flex gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      title="Atualizar perfil"
                      className="rounded-lg p-1.5 hover:bg-muted"
                      onClick={(event) => {
                        event.stopPropagation();
                        sync.mutate({ profile_id: profile.id });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") sync.mutate({ profile_id: profile.id });
                      }}
                    >
                      <RefreshCw size={15} className={sync.isPending ? "animate-spin" : ""} />
                    </span>
                    <a
                      title="Abrir no Instagram"
                      className="rounded-lg p-1.5 hover:bg-muted"
                      href={profile.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink size={15} />
                    </a>
                  </span>
                </div>
                {profile.last_error && (
                  <p className="mt-2 line-clamp-2 text-xs text-destructive">{profile.last_error}</p>
                )}
              </div>
            );
          })}
        </div>
        <section className="space-y-3 rounded-2xl border bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display font-bold">Relatório dos últimos 7 dias</p>
              <p className="text-xs text-muted-foreground">
                Atualização automática diária às 19h. Alcance e compartilhamentos não são públicos.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!profiles.length}
              onClick={() => downloadWeeklyReport(reportRows, profiles.filter((profile) => profile.is_fixed))}
            >
              <Download /> Baixar relatório semanal
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {profiles.filter((profile) => profile.is_fixed).map((profile) => {
              const rows = reportRows.filter((row) => row.tracked_profile_id === profile.id);
              return (
                <div key={profile.id} className="rounded-xl border bg-card p-3">
                  <p className="truncate text-xs font-semibold">@{profile.username}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {rows.reduce((sum, row) => sum + row.posts_count, 0)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">posts em 7 dias</p>
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2.5">Data</th>
                  <th className="p-2.5">Perfil</th>
                  <th className="p-2.5 text-right">Posts</th>
                  <th className="p-2.5 text-right">Visualizações</th>
                  <th className="p-2.5 text-right">Curtidas</th>
                  <th className="p-2.5 text-right">Comentários</th>
                  <th className="p-2.5 text-right">Alcance</th>
                  <th className="p-2.5 text-right">Compart.</th>
                </tr>
              </thead>
              <tbody>
                {[...weekDates].reverse().flatMap((date) =>
                  profiles.filter((profile) => profile.is_fixed).map((profile) => {
                    const row = reportRows.find((item) =>
                      item.report_date === date && item.tracked_profile_id === profile.id
                    );
                    return (
                      <tr key={`${date}-${profile.id}`} className="border-b last:border-0">
                        <td className="p-2.5">{date.split("-").reverse().join("/")}</td>
                        <td className="p-2.5 font-semibold">@{profile.username}</td>
                        <td className="p-2.5 text-right">{row?.posts_count ?? 0}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.views ?? 0)}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.likes ?? 0)}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.comments ?? 0)}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.reach ?? null)}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.shares ?? null)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">
          Perfis públicos fornecem curtidas, comentários e visualizações quando disponíveis.
          Alcance, compartilhamentos e salvos exigem uma conta profissional conectada.
        </p>
      </CardContent>
    </Card>
  );
}
