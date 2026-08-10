import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, Download, ExternalLink, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
  authored_posts_count: number;
  collaborations_count: number;
  likes: number;
  comments: number;
  last_sync_at: string;
};

type TrackedPublication = {
  tracked_profile_id?: string | null;
  published_at: string;
};

type Props = {
  publications: TrackedPublication[];
  selectedProfile: string;
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

function brightDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${month}-${day}-${year}`;
}

function reportEndDate() {
  return brightDate(todayKey());
}

function readableSyncError(value: unknown) {
  const detail = typeof value === "string" ? value.trim() : "";
  if (/error sending request|172\.\d+\.\d+\.\d+|fetch failed|network/i.test(detail)) {
    return "Não foi possível conectar ao serviço de relatórios. Tente novamente.";
  }
  if (/bright data http 400/i.test(detail)) {
    return "A Bright Data recusou a consulta. Tente atualizar novamente.";
  }
  return detail || "Não foi possível sincronizar o perfil";
}

function downloadWeeklyReport(rows: DailyReportRow[], profiles: TrackedInstagramProfile[]) {
  const dates = lastSevenDays();
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  pdf.setFillColor(20, 33, 61);
  pdf.rect(0, 0, 297, 28, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(18);
  pdf.text("Copy News | Relatório semanal do Instagram", 14, 13);
  pdf.setFontSize(10);
  pdf.text(`Período: ${dates[0].split("-").reverse().join("/")} a ${dates.at(-1)!.split("-").reverse().join("/")}`, 14, 21);
  pdf.setTextColor(25, 25, 25);
  autoTable(pdf, {
    startY: 35,
    head: [["Data", "Perfil", "Publicados", "Colaborações aceitas", "Total exibido", "Curtidas", "Comentários"]],
    body: dates.flatMap((date) => profiles.map((profile) => {
      const row = rows.find((item) => item.report_date === date && item.tracked_profile_id === profile.id);
      return [date.split("-").reverse().join("/"), `@${profile.username}`,
        row?.authored_posts_count ?? 0, row?.collaborations_count ?? 0,
        row?.posts_count ?? 0, row?.likes ?? 0, row?.comments ?? 0];
    })),
    theme: "striped",
    headStyles: { fillColor: [31, 111, 235] },
    styles: { fontSize: 8, cellPadding: 2.3 },
  });
  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 35;
  pdf.setFontSize(9);
  pdf.text("Critério: Publicados conta somente posts criados pelo perfil. Colaborações aceitas aparecem separadamente.", 14, finalY + 8);
  pdf.save(`relatorio-instagram-${dates[0]}-a-${dates.at(-1)}.pdf`);
}

function ProfileMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[10px] bg-muted/60 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-bold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
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
  return readableSyncError(detail);
}

export function InstagramProfileTracker({
  publications,
  selectedProfile,
  onSelectProfile,
  onSynced,
}: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [reportDay, setReportDay] = useState(todayKey());
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
  const fixedProfiles = profiles.filter((profile) => profile.is_fixed);
  const reportProfiles = selectedProfile === "all"
    ? fixedProfiles
    : fixedProfiles.filter((profile) => profile.id === selectedProfile);
  const selectedProfileData = profiles.find((profile) => profile.id === selectedProfile);
  const selectedProfileRows = reportRows.filter((row) => row.tracked_profile_id === selectedProfile);
  const selectedToday = selectedProfileRows.find((row) => row.report_date === todayKey());

  async function runSync(body: { profile?: string; profile_id?: string }) {
    let request: {
      profile?: string;
      profile_id?: string;
      start_date: string;
      end_date: string;
    } = { ...body, start_date: brightDate(weekDates[0]), end_date: reportEndDate() };
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
        start_date: brightDate(weekDates[0]),
        end_date: reportEndDate(),
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
        `@${result.profile.username}: ${result.imported} ${result.imported === 1 ? "publicação atualizada" : "publicações atualizadas"}`,
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
      const failures: string[] = [];
      let updated = 0;
      // Avoid opening several paid collector jobs at the exact same time.
      for (const profile of fixedProfiles) {
        try {
          await runSync({ profile_id: profile.id });
          updated += 1;
        } catch (error) {
          failures.push(`@${profile.username}: ${readableSyncError(
            error instanceof Error ? error.message : error,
          )}`);
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracked-instagram-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["publications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["instagram-daily-report"] }),
      ]);
      await onSynced();
      if (updated) toast.success(`${updated} ${updated === 1 ? "perfil atualizado" : "perfis atualizados"}`);
      if (failures.length) {
        toast.error(
          `${failures.length} ${failures.length === 1 ? "perfil não foi atualizado" : "perfis não foram atualizados"}. ${failures[0]}`,
        );
      }
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
              Informe o perfil do Instagram.
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
            )?.authored_posts_count ?? publications.filter((publication) =>
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
                  <p className="mt-2 line-clamp-2 text-xs text-destructive">
                    {readableSyncError(profile.last_error)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {selectedProfileData && (
          <section className="rounded-[var(--radius-card)] border bg-card p-4" aria-label={`Resumo de @${selectedProfileData.username}`}>
            <div className="flex items-center gap-3">
              {selectedProfileData.avatar_url ? (
                <img className="size-12 rounded-full object-cover" src={selectedProfileData.avatar_url} alt="" />
              ) : (
                <div className="grid size-12 place-items-center rounded-full bg-muted"><AtSign size={20} /></div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display font-bold">@{selectedProfileData.username}</h3>
                <p className="truncate text-xs text-muted-foreground">{selectedProfileData.display_name || `${formatNumber(selectedProfileData.followers_count)} seguidores`}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onSelectProfile("all")}>Ver todos</Button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ProfileMetric label="Posts hoje" value={selectedToday?.authored_posts_count ?? 0} />
              <ProfileMetric label="Posts em 7 dias" value={selectedProfileRows.reduce((sum, row) => sum + row.authored_posts_count, 0)} />
              <ProfileMetric label="Curtidas em 7 dias" value={selectedProfileRows.reduce((sum, row) => sum + row.likes, 0)} />
              <ProfileMetric label="Comentários em 7 dias" value={selectedProfileRows.reduce((sum, row) => sum + row.comments, 0)} />
            </div>
          </section>
        )}
        <section className="space-y-3 rounded-2xl border bg-muted/20 p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display font-bold">Relatório diário</p>
              <p className="text-xs text-muted-foreground">Consulte qualquer dia dos últimos 7 dias.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!profiles.length}
              onClick={() => downloadWeeklyReport(reportRows, reportProfiles)}
            >
              <Download /> Baixar relatório semanal
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar dia do relatório">
            {[...weekDates].reverse().map((date, index) => (
              <Button key={date} size="sm" className="shrink-0" variant={reportDay === date ? "default" : "outline"} onClick={() => setReportDay(date)}>
                {index === 0 ? "Hoje" : index === 1 ? "Ontem" : date.slice(5).split("-").reverse().join("/")}
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {reportProfiles.map((profile) => {
              const row = reportRows.find((item) => item.tracked_profile_id === profile.id && item.report_date === reportDay);
              return (
                <div key={profile.id} className="rounded-xl border bg-card p-3">
                  <p className="truncate text-xs font-semibold">@{profile.username}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {row?.authored_posts_count ?? 0}
                  </p>
                  <p className="text-[11px] text-muted-foreground">publicados em {reportDay.split("-").reverse().join("/")}</p>
                </div>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2.5">Data</th>
                  <th className="p-2.5">Perfil</th>
                  <th className="p-2.5 text-right">Publicados</th>
                  <th className="p-2.5 text-right">Colaborações aceitas</th>
                  <th className="p-2.5 text-right">Total exibido</th>
                  <th className="p-2.5 text-right">Curtidas</th>
                  <th className="p-2.5 text-right">Comentários</th>
                </tr>
              </thead>
              <tbody>
                {reportProfiles.map((profile) => {
                    const row = reportRows.find((item) =>
                      item.report_date === reportDay && item.tracked_profile_id === profile.id
                    );
                    return (
                      <tr key={`${reportDay}-${profile.id}`} className="border-b last:border-0">
                        <td className="p-2.5">{reportDay.split("-").reverse().join("/")}</td>
                        <td className="p-2.5 font-semibold">@{profile.username}</td>
                        <td className="p-2.5 text-right font-semibold">{row?.authored_posts_count ?? 0}</td>
                        <td className="p-2.5 text-right">{row?.collaborations_count ?? 0}</td>
                        <td className="p-2.5 text-right">{row?.posts_count ?? 0}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.likes ?? 0)}</td>
                        <td className="p-2.5 text-right">{formatNumber(row?.comments ?? 0)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
        <p className="text-xs text-muted-foreground">
          Curtidas e comentários consideram apenas as publicações realmente criadas pelo perfil.
          Colaborações aceitas são contabilizadas separadamente.
        </p>
      </CardContent>
    </Card>
  );
}
