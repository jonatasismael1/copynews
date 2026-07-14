import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Database,
  History,
  Images,
  ChartNoAxesCombined,
  KeyRound,
  Link2,
  Palette,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Smartphone,
  Unplug,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TIMEZONE } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";
import { ProfileAvatar } from "@/components/profile-avatar";
import { squareAvatarDataUrl } from "@/lib/avatar";
import { PwaInstallButton } from "@/components/pwa-install";
import { useConnectedAccounts } from "@/hooks/use-data";

export function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [pageForm, setPageForm] = useState({ name: "", platform: "Instagram" });
  const [categoryName, setCategoryName] = useState("");
  const [editorLinks, setEditorLinks] = useState({
    video: profile?.canva_video_url || "",
    image: profile?.canva_image_url || "",
  });
  const [savingEditorLinks, setSavingEditorLinks] = useState(false);
  const [instagramPageId, setInstagramPageId] = useState("");
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [syncingInstagram, setSyncingInstagram] = useState<string | null>(null);
  const canManageLookups =
    profile?.role === "admin" || profile?.role === "editor";
  const { data: connectedAccounts = [], refetch: refetchAccounts } =
    useConnectedAccounts(true);

  const { data: lookups } = useQuery({
    queryKey: ["settings-lookups"],
    enabled: true,
    queryFn: async () => {
      const [pages, categories] = await Promise.all([
        supabase.from("pages").select("*").order("name"),
        supabase.from("categories").select("*").order("name"),
      ]);
      if (pages.error) throw pages.error;
      if (categories.error) throw categories.error;
      return { pages: pages.data, categories: categories.data };
    },
  });
  const rows = [
    [Database, "Supabase", "Conectado pelo ambiente"],
    [Server, "Cobalt", "Aquisição externa de mídia"],
    [KeyRound, "OpenRouter", "IA e transcrição no backend"],
    [ShieldCheck, "Segurança", "RLS e Storage privado"],
    [Palette, "Fuso operacional", TIMEZONE],
    [History, "Histórico de contas", "Publicações e métricas de até 90 dias"],
  ] as const;

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code) return;
    const expectedState = sessionStorage.getItem("copynews-meta-state");
    const pageId = sessionStorage.getItem("copynews-meta-page");
    sessionStorage.removeItem("copynews-meta-state");
    sessionStorage.removeItem("copynews-meta-page");
    setSearchParams({}, { replace: true });
    if (!state || state !== expectedState || !pageId) {
      toast.error("A conexão com a Meta expirou. Tente novamente.");
      return;
    }
    queueMicrotask(() => setConnectingInstagram(true));
    supabase.functions
      .invoke("instagram-account", {
        body: {
          action: "instagram_oauth_callback",
          code,
          page_id: pageId,
          redirect_uri: `${window.location.origin}/configuracoes`,
        },
      })
      .then(async ({ data, error }) => {
        if (error) throw error;
        const accountIds = (data?.accounts || []).map(
          (account: { id: string }) => account.id,
        );
        for (const accountId of accountIds) {
          const { error: syncError } = await supabase.functions.invoke(
            "sync-instagram-publications",
            { body: { account_id: accountId } },
          );
          if (syncError) throw syncError;
        }
        await refetchAccounts();
        queryClient.invalidateQueries({ queryKey: ["publications"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        toast.success(
          `${Number(data?.count || 1)} conta(s) profissional(is) conectada(s)`,
        );
      })
      .catch(() =>
        toast.error(
          "Não foi possível concluir a conexão. Confira as permissões do aplicativo Meta.",
        ),
      )
      .finally(() => setConnectingInstagram(false));
  }, [queryClient, refetchAccounts, searchParams, setSearchParams]);

  async function updatePassword(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return toast.error("Use pelo menos 8 caracteres.");
    if (password !== confirmation)
      return toast.error("As senhas não coincidem.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirmation("");
    toast.success("Senha atualizada com segurança.");
  }

  async function updateAvatar(file?: File) {
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const dataUrl = await squareAvatarDataUrl(file);
      const { error } = await supabase.functions.invoke("profile-avatar", {
        body: { data_url: dataUrl },
      });
      if (error) throw error;
      await refreshProfile();
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      toast.success("Foto de perfil atualizada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível trocar a foto",
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function saveEditorLinks(event: FormEvent) {
    event.preventDefault();
    setSavingEditorLinks(true);
    const { error } = await supabase.functions.invoke("profile-settings", {
      body: {
        canva_video_url: editorLinks.video,
        canva_image_url: editorLinks.image,
      },
    });
    setSavingEditorLinks(false);
    if (error) {
      const context = await error.context?.json().catch(() => null);
      return toast.error(
        context?.error || "Não foi possível salvar os links do Canva",
      );
    }
    await refreshProfile();
    toast.success("Links do Canva atualizados");
  }

  async function connectInstagram(event: FormEvent) {
    event.preventDefault();
    const appId = import.meta.env.VITE_META_APP_ID;
    if (!appId) return toast.error("Integração Meta ainda não configurada");
    if (!instagramPageId) return toast.error("Selecione a página do Copy News");
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const state = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    sessionStorage.setItem("copynews-meta-state", state);
    sessionStorage.setItem("copynews-meta-page", instagramPageId);
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", `${window.location.origin}/configuracoes`);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
    url.searchParams.set(
      "scope",
      "instagram_business_basic,instagram_business_manage_insights",
    );
    window.location.assign(url.toString());
  }

  async function disconnectInstagram(accountId: string) {
    if (!window.confirm("Desconectar esta conta do Instagram?")) return;
    const { error } = await supabase.functions.invoke("instagram-account", {
      body: { action: "disconnect", account_id: accountId },
    });
    if (error) return toast.error("Não foi possível desconectar a conta");
    await refetchAccounts();
    toast.success("Conta desconectada");
  }

  async function syncInstagram(accountId: string) {
    setSyncingInstagram(accountId);
    const { data, error } = await supabase.functions.invoke(
      "sync-instagram-publications",
      { body: { account_id: accountId } },
    );
    setSyncingInstagram(null);
    if (error) return toast.error("Não foi possível sincronizar o Instagram");
    await refetchAccounts();
    queryClient.invalidateQueries({ queryKey: ["publications"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    toast.success(
      `${Number(data?.imported || 0)} publicação(ões) e métricas atualizadas`,
    );
  }

  async function createPage(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("pages").insert({
      name: pageForm.name.trim(),
      platform: pageForm.platform.trim(),
    });
    if (error) return toast.error(error.message);
    setPageForm({ name: "", platform: "Instagram" });
    queryClient.invalidateQueries({ queryKey: ["settings-lookups"] });
    queryClient.invalidateQueries({ queryKey: ["lookups"] });
    toast.success("Página cadastrada");
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryName.trim();
    const slug = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const { error } = await supabase.from("categories").insert({ name, slug });
    if (error) return toast.error(error.message);
    setCategoryName("");
    queryClient.invalidateQueries({ queryKey: ["settings-lookups"] });
    queryClient.invalidateQueries({ queryKey: ["lookups"] });
    toast.success("Categoria cadastrada");
  }

  async function toggleLookup(
    table: "pages" | "categories",
    id: string,
    active: boolean,
  ) {
    if (
      active &&
      !window.confirm(
        "Desativar este item? Ele deixará de aparecer em novos registros.",
      )
    )
      return;
    const { error } = await supabase
      .from(table)
      .update({ is_active: !active })
      .eq("id", id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["settings-lookups"] });
    queryClient.invalidateQueries({ queryKey: ["lookups"] });
    toast.success("Configuração atualizada");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Ambiente</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Configurações</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Integrações sensíveis são configuradas no backend e nunca exibidas
          aqui.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Foto de perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <ProfileAvatar
              src={profile?.avatar_url}
              name={profile?.name}
              className="size-20 ring-4 ring-secondary"
            />
            <div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <Camera size={17} />
                {uploadingAvatar ? "Enviando..." : "Escolher na galeria"}
                <input
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingAvatar}
                  onChange={(event) => updateAvatar(event.target.files?.[0])}
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                A imagem será centralizada e recortada em formato quadrado.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone size={19} />
              Aplicativo no celular
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Instale o Copy News na tela inicial para abrir como aplicativo.
            </p>
            <PwaInstallButton />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 size={19} />
            Editores do Canva
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saveEditorLinks}>
            <p className="text-sm text-muted-foreground">
              Estes links abrem o modelo correto depois que o título e a legenda
              estiverem prontos. Cada usuário pode configurar os próprios modelos.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Modelo para vídeo">
                <div className="relative">
                  <Video className="absolute left-3 top-3 text-muted-foreground" size={17} />
                  <Input
                    className="pl-10"
                    type="url"
                    inputMode="url"
                    placeholder="https://www.canva.com/design/..."
                    value={editorLinks.video}
                    onChange={(event) =>
                      setEditorLinks({ ...editorLinks, video: event.target.value })
                    }
                  />
                </div>
              </Field>
              <Field label="Modelo para imagem ou carrossel">
                <div className="relative">
                  <Images className="absolute left-3 top-3 text-muted-foreground" size={17} />
                  <Input
                    className="pl-10"
                    type="url"
                    inputMode="url"
                    placeholder="https://www.canva.com/design/..."
                    value={editorLinks.image}
                    onChange={(event) =>
                      setEditorLinks({ ...editorLinks, image: event.target.value })
                    }
                  />
                </div>
              </Field>
            </div>
            <Button disabled={savingEditorLinks}>
              <Save />
              {savingEditorLinks ? "Salvando..." : "Salvar links"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartNoAxesCombined size={19} />
              Instagram profissional e métricas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Cada usuário conecta sua própria conta Business ou Creator diretamente
              pelo login oficial do Instagram. O administrador visualiza os resultados de toda a
              equipe, mas os tokens permanecem criptografados no backend.
            </p>
            <form className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end" onSubmit={connectInstagram}>
              <Field label="Página do Copy News">
                <select
                  required
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                  value={instagramPageId}
                  onChange={(event) => setInstagramPageId(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {(lookups?.pages ?? []).map((page) => (
                    <option key={page.id} value={page.id}>{page.name}</option>
                  ))}
                </select>
              </Field>
              <Button disabled={connectingInstagram}>
                <ChartNoAxesCombined />
                {connectingInstagram ? "Conectando..." : "Entrar com Instagram"}
              </Button>
            </form>
            <div className="mt-5 divide-y border-t">
              {connectedAccounts.length ? connectedAccounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      Instagram • {account.account_name || account.provider_account_id}
                    </p>
                    {profile?.role === "admin" && (
                      <p className="text-xs text-muted-foreground">
                        Usuário: {(account.profiles as { name?: string } | null)?.name || "Não identificado"}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {account.last_sync_at
                        ? `Última atualização: ${new Date(account.last_sync_at).toLocaleString("pt-BR")}`
                        : "Ainda sem atualização de métricas"}
                    </p>
                  </div>
                  <Badge variant={account.status === "connected" ? "success" : "danger"}>
                    {account.status === "connected" ? "Conectada" : "Desconectada"}
                  </Badge>
                  {account.status === "connected" && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={syncingInstagram === account.id}
                        onClick={() => syncInstagram(account.id)}
                      >
                        <RefreshCw className={syncingInstagram === account.id ? "animate-spin" : ""} />
                        Atualizar agora
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => disconnectInstagram(account.id)}>
                        <Unplug /> Desconectar
                      </Button>
                    </>
                  )}
                </div>
              )) : (
                <p className="py-5 text-sm text-muted-foreground">Nenhuma conta profissional conectada.</p>
              )}
            </div>
          </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estado dos serviços</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {rows.map(([Icon, name, description]) => (
            <div key={name} className="flex items-center gap-4 py-4">
              <div className="grid size-10 place-items-center rounded-xl bg-secondary">
                <Icon size={18} />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{name}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Badge variant="success">Configurado</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      {canManageLookups && (
        <div className="grid gap-6 lg:grid-cols-2">
          <LookupCard
            title="Páginas de publicação"
            onSubmit={createPage}
            submitLabel="Adicionar página"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input
                  required
                  minLength={2}
                  value={pageForm.name}
                  onChange={(event) =>
                    setPageForm({ ...pageForm, name: event.target.value })
                  }
                  placeholder="Portal principal"
                />
              </Field>
              <Field label="Plataforma">
                <Input
                  required
                  minLength={2}
                  value={pageForm.platform}
                  onChange={(event) =>
                    setPageForm({ ...pageForm, platform: event.target.value })
                  }
                />
              </Field>
            </div>
            <LookupList
              items={lookups?.pages ?? []}
              secondaryKey="platform"
              onToggle={(id, active) => toggleLookup("pages", id, active)}
            />
          </LookupCard>
          <LookupCard
            title="Categorias editoriais"
            onSubmit={createCategory}
            submitLabel="Adicionar categoria"
          >
            <Field label="Nome">
              <Input
                required
                minLength={2}
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Tecnologia"
              />
            </Field>
            <LookupList
              items={lookups?.categories ?? []}
              secondaryKey="slug"
              onToggle={(id, active) => toggleLookup("categories", id, active)}
            />
          </LookupCard>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Alterar minha senha</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={updatePassword}>
            <Field label="Nova senha">
              <Input
                type="password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Confirmar nova senha">
              <Input
                type="password"
                minLength={8}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : "Atualizar senha"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Política editorial padrão</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Gerar texto jornalístico, claro e direto. Preservar os fatos,
            sinalizar divergências entre fontes, nunca inventar nomes, números,
            locais, datas ou citações. Toda alteração por IA exige prévia e
            confirmação humana.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

type LookupItem = {
  id: string;
  name: string;
  is_active: boolean;
  [key: string]: unknown;
};

function LookupList({
  items,
  secondaryKey,
  onToggle,
}: {
  items: LookupItem[];
  secondaryKey: string;
  onToggle: (id: string, active: boolean) => void;
}) {
  return (
    <div className="mt-5 divide-y border-t">
      {items.length ? (
        items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {String(item[secondaryKey] ?? "")}
              </p>
            </div>
            <Badge variant={item.is_active ? "success" : "danger"}>
              {item.is_active ? "Ativo" : "Inativo"}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => onToggle(item.id, item.is_active)}
            >
              {item.is_active ? "Desativar" : "Ativar"}
            </Button>
          </div>
        ))
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum item cadastrado.
        </p>
      )}
    </div>
  );
}

function LookupCard({
  title,
  onSubmit,
  submitLabel,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent) => void;
  submitLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <div className="space-y-3">{children}</div>
          <Button className="mt-4" size="sm">
            <Plus />
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
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
