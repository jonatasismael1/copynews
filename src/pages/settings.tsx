import { FormEvent, useState } from "react";
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
  const [instagramForm, setInstagramForm] = useState({ pageId: "", token: "" });
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const canManageLookups =
    profile?.role === "admin" || profile?.role === "editor";
  const { data: connectedAccounts = [], refetch: refetchAccounts } =
    useConnectedAccounts(profile?.role === "admin");

  const { data: lookups } = useQuery({
    queryKey: ["settings-lookups"],
    enabled: canManageLookups,
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
    if (error) return toast.error("Não foi possível salvar os links do Canva");
    await refreshProfile();
    toast.success("Links do Canva atualizados");
  }

  async function connectInstagram(event: FormEvent) {
    event.preventDefault();
    setConnectingInstagram(true);
    const { error } = await supabase.functions.invoke("instagram-account", {
      body: {
        action: "connect",
        page_id: instagramForm.pageId,
        access_token: instagramForm.token,
      },
    });
    setConnectingInstagram(false);
    if (error)
      return toast.error(
        "Não foi possível validar a conta. Confira o token e as permissões de insights.",
      );
    setInstagramForm({ pageId: "", token: "" });
    await refetchAccounts();
    toast.success("Conta profissional do Instagram conectada");
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

      {profile?.role === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ChartNoAxesCombined size={19} />
              Instagram profissional e métricas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Conecte uma conta Business ou Creator usando um token oficial com
              permissão de insights. O token é validado no Instagram e armazenado
              criptografado; ele nunca volta para o navegador.
            </p>
            <form className="grid gap-4 md:grid-cols-[1fr_1.5fr_auto] md:items-end" onSubmit={connectInstagram}>
              <Field label="Página do Copy News">
                <select
                  required
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                  value={instagramForm.pageId}
                  onChange={(event) =>
                    setInstagramForm({ ...instagramForm, pageId: event.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {(lookups?.pages ?? []).map((page) => (
                    <option key={page.id} value={page.id}>{page.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Token da Instagram API">
                <Input
                  required
                  type="password"
                  autoComplete="off"
                  value={instagramForm.token}
                  onChange={(event) =>
                    setInstagramForm({ ...instagramForm, token: event.target.value })
                  }
                  placeholder="Cole o token profissional"
                />
              </Field>
              <Button disabled={connectingInstagram}>
                <ChartNoAxesCombined />
                {connectingInstagram ? "Validando..." : "Conectar"}
              </Button>
            </form>
            <div className="mt-5 divide-y border-t">
              {connectedAccounts.length ? connectedAccounts.map((account) => (
                <div key={account.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Instagram • {account.provider_account_id}</p>
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
                    <Button type="button" size="sm" variant="ghost" onClick={() => disconnectInstagram(account.id)}>
                      <Unplug /> Desconectar
                    </Button>
                  )}
                </div>
              )) : (
                <p className="py-5 text-sm text-muted-foreground">Nenhuma conta profissional conectada.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
