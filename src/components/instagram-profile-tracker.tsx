import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, ExternalLink, LoaderCircle, Plus, RefreshCw } from "lucide-react";
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
  const sync = useMutation({
    mutationFn: async (body: { profile?: string; profile_id?: string }) => {
      let request = { ...body, start_date: syncStartDate, end_date: syncEndDate };
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
    },
    onSuccess: async (result) => {
      setInput("");
      setShowForm(false);
      onSelectProfile(result.profile.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracked-instagram-profiles"] }),
        queryClient.invalidateQueries({ queryKey: ["publications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
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
          <Button variant="outline" onClick={() => setShowForm((value) => !value)}>
            <Plus /> Acompanhar perfil
          </Button>
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
            const postsToday = publications.filter((publication) =>
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
        <p className="text-xs text-muted-foreground">
          Perfis públicos fornecem curtidas, comentários e visualizações quando disponíveis.
          Alcance, compartilhamentos e salvos exigem uma conta profissional conectada.
        </p>
      </CardContent>
    </Card>
  );
}
