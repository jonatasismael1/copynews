import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Plus,
  Radio,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminDailyResults, useDashboard } from "@/hooks/use-data";
import { useAuth } from "@/providers/auth-provider";

type Period = 1 | 7 | 30 | 90;

export function DashboardPage() {
  const { profile } = useAuth();
  const [period, setPeriod] = useState<Period>(1);
  const [dailyUser, setDailyUser] = useState("all");
  const [dailyDate, setDailyDate] = useState("");
  const { data, isLoading, error } = useDashboard(period);
  const { data: adminDaily = [], isLoading: adminDailyLoading } =
    useAdminDailyResults(period, profile?.role === "admin");
  const availableDays = [...new Set(adminDaily.map((row) => row.day))];
  const activeDailyDate = dailyDate || availableDays[0] || "";
  const dailyUsers = Array.from(
    new Map(adminDaily.map((row) => [row.user_id, row.user_name])).entries(),
  );
  const filteredDaily = adminDaily.filter(
    (row) =>
      row.day === activeDailyDate &&
      (dailyUser === "all" || row.user_id === dailyUser),
  );
  const periodLabel =
    period === 1 ? "Hoje" : period === 90 ? "3 meses" : `${period} dias`;
  const cards = [
    [
      "Notícias criadas",
      data?.news_created ?? 0,
      FileCheck2,
      "bg-blue-50 text-blue-700",
    ],
    [
      "Aguardando aprovação",
      data?.awaiting_approval ?? 0,
      Clock3,
      "bg-amber-50 text-amber-700",
    ],
    [
      "Aprovadas",
      data?.approved ?? 0,
      CheckCircle2,
      "bg-emerald-50 text-emerald-700",
    ],
    [
      "Publicações",
      data?.publications ?? 0,
      Radio,
      "bg-violet-50 text-violet-700",
    ],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Pulso editorial</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
            Visão geral
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Produção e distribuição no fuso America/Maceio.
          </p>
        </div>
        <Button asChild>
          <Link to="/criar">
            <Plus />
            Nova notícia
          </Link>
        </Button>
      </div>

      <div
        className="flex w-fit rounded-xl border bg-card p-1"
        aria-label="Filtrar período"
      >
        {([1, 7, 30, 90] as Period[]).map((days) => (
          <Button
            key={days}
            size="sm"
            variant={period === days ? "secondary" : "ghost"}
            onClick={() => setPeriod(days)}
          >
            {days === 1 ? "Hoje" : days === 90 ? "3 meses" : `${days} dias`}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5 text-sm text-red-700">
            Não foi possível carregar o dashboard.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32" />
            ))
          : cards.map(([label, value, Icon, color]) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 font-display text-3xl font-bold">
                      {value}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {periodLabel}
                    </p>
                  </div>
                  <div
                    className={`grid size-11 place-items-center rounded-xl ${color}`}
                  >
                    <Icon size={20} />
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Publicações por dia</CardTitle>
            <p className="text-sm text-muted-foreground">
              Período selecionado • America/Maceio
            </p>
          </CardHeader>
          <CardContent className="h-72">
            {isLoading ? (
              <Skeleton className="h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data?.daily_series ?? []}
                  margin={{ left: -20, right: 8, top: 10 }}
                >
                  <defs>
                    <linearGradient
                      id="publication-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    fontSize={11}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    fill="url(#publication-fill)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <GoalCard
          publications={data?.publications ?? 0}
          goal={data?.period_goal ?? 0}
          external={data?.external_publications ?? 0}
          scheduled={data?.scheduled ?? 0}
          label={periodLabel}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard
          title="Produção por usuário"
          icon={Users}
          rows={(data?.production_by_user ?? []).map((row) => ({
            label: row.name,
            value: row.total,
          }))}
        />
        <BreakdownCard
          title="Publicações por página"
          icon={Radio}
          rows={(data?.publications_by_page ?? []).map((row) => ({
            label: row.name,
            value: row.total,
          }))}
        />
      </div>

      {profile?.role === "admin" && (
        <Card>
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users size={19} className="text-primary" />
                Resultado diário por usuário
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Acompanhe toda a equipe, incluindo sua própria produção.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Dia
                <select
                  className="mt-1 block h-10 w-full min-w-40 rounded-xl border bg-background px-3 text-sm text-foreground"
                  value={activeDailyDate}
                  onChange={(event) => setDailyDate(event.target.value)}
                >
                  {availableDays.map((day) => (
                    <option key={day} value={day}>
                      {new Date(`${day}T12:00:00-03:00`).toLocaleDateString("pt-BR")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Usuário
                <select
                  className="mt-1 block h-10 w-full min-w-48 rounded-xl border bg-background px-3 text-sm text-foreground"
                  value={dailyUser}
                  onChange={(event) => setDailyUser(event.target.value)}
                >
                  <option value="all">Todos os usuários</option>
                  {dailyUsers.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {adminDailyLoading ? (
              <Skeleton className="h-36" />
            ) : filteredDaily.length ? (
              <div className="overflow-x-auto rounded-xl border">
                <div className="grid min-w-[720px] grid-cols-[1.5fr_repeat(5,1fr)] gap-3 bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground">
                  <span>Usuário</span>
                  <span>Criadas</span>
                  <span>Finalizadas</span>
                  <span>Publicadas</span>
                  <span>Meta diária</span>
                  <span>Interações</span>
                </div>
                {filteredDaily.map((row) => (
                  <div key={`${row.day}-${row.user_id}`} className="grid min-w-[720px] grid-cols-[1.5fr_repeat(5,1fr)] gap-3 border-t px-4 py-3 text-sm">
                    <b>{row.user_name}</b>
                    <span>{row.news_created}</span>
                    <span>{row.news_completed}</span>
                    <span>{row.publications}</span>
                    <span>{row.publications}/{row.daily_goal}</span>
                    <span>{Number(row.interactions).toLocaleString("pt-BR")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Nenhum resultado para os filtros selecionados." />
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="text-amber-500" />
              Ranking editorial
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.ranking?.length ? (
              <div className="divide-y">
                {data.ranking.map((row, index) => (
                  <div key={row.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">
                      {index + 1}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.name}
                    </p>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {row.publications} publicações
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {Number(row.interactions).toLocaleString("pt-BR")}{" "}
                        interações
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="O ranking aparecerá após as primeiras publicações." />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Destaques do período</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/publicacoes">
                Ver todas
                <ArrowUpRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.top_publications?.length ? (
              <div className="divide-y">
                {data.top_publications.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-muted text-xs font-bold">
                      {index + 1}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {item.title}
                    </p>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {Number(item.views).toLocaleString("pt-BR")} views
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {Number(item.interactions).toLocaleString("pt-BR")}{" "}
                        interações
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty text="Os destaques aparecerão após os primeiros snapshots." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GoalCard({
  publications,
  goal,
  external,
  scheduled,
  label,
}: {
  publications: number;
  goal: number;
  external: number;
  scheduled: number;
  label: string;
}) {
  const progress = Math.min(100, (publications / Math.max(1, goal)) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta • {label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid place-items-center py-4">
          <div
            className="relative grid size-36 place-items-center rounded-full"
            style={{
              background: `conic-gradient(hsl(var(--primary)) ${progress}%,hsl(var(--muted)) 0)`,
            }}
          >
            <div className="grid size-28 place-items-center rounded-full bg-card text-center">
              <div>
                <p className="font-display text-3xl font-bold">
                  {publications}
                  <span className="text-base text-muted-foreground">
                    /{goal}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">publicações</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Externas</span>
            <b>{external}</b>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Agendadas</span>
            <b>{scheduled}</b>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  rows,
}: {
  title: string;
  icon: typeof Users;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon size={19} className="text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="space-y-4">
            {rows.slice(0, 8).map((row) => (
              <div key={row.label}>
                <div className="mb-1.5 flex justify-between gap-3 text-sm">
                  <span className="truncate">{row.label}</span>
                  <b>{row.value}</b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(row.value / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Nenhum registro no período." />
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
