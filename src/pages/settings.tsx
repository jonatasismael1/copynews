import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Database,
  History,
  KeyRound,
  Palette,
  Plus,
  Server,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TIMEZONE } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

export function SettingsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [pageForm, setPageForm] = useState({ name: "", platform: "Instagram" });
  const [categoryName, setCategoryName] = useState("");
  const canManageLookups =
    profile?.role === "admin" || profile?.role === "editor";
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
