import { useState } from "react";
import { MoreHorizontal, Plus, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useProfiles } from "@/hooks/use-data";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { roleLabels } from "@/lib/constants";
import { ProfileAvatar } from "@/components/profile-avatar";
export function UsersPage() {
  const { profile } = useAuth();
  const { data = [], refetch } = useProfiles();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [savingGoal, setSavingGoal] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "writer",
    daily_goal: 10,
  });
  const selectedUser = data.find((user) => user.id === selectedUserId);
  if (profile?.role !== "admin")
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <ShieldCheck className="mx-auto text-muted-foreground" />
          <h1 className="mt-4 font-display text-xl font-bold">Área restrita</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente administradores gerenciam usuários.
          </p>
        </CardContent>
      </Card>
    );
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "create", ...form },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Usuário criado");
      setOpen(false);
      refetch();
    }
  }
  async function toggle(id: string, is_active: boolean) {
    if (is_active && !window.confirm("Desativar o acesso deste usuário?"))
      return;
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "update", id, is_active: !is_active },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Acesso atualizado");
      refetch();
    }
  }
  async function saveGoal(id: string) {
    const dailyGoal = Number(goalDrafts[id]);
    if (!Number.isInteger(dailyGoal) || dailyGoal < 0) {
      toast.error("Informe uma meta diária inteira e maior ou igual a zero");
      return;
    }
    setSavingGoal(id);
    const { error } = await supabase.functions.invoke("admin-users", {
      body: { action: "update", id, daily_goal: dailyGoal },
    });
    setSavingGoal(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Meta diária atualizada");
      setGoalDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      refetch();
    }
  }
  return (
    <div className="page-container space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Administração</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Usuários</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Acesso interno, papéis e metas individuais.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus />
          Novo usuário
        </Button>
      </div>
      <div className="grid gap-3">
        {data.map((user) => (
          <Card key={user.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <ProfileAvatar
                src={user.avatar_url}
                name={user.name}
                className="size-11"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <div className="ml-auto hidden text-right sm:block">
                <Badge variant={user.is_active ? "success" : "danger"}>
                  {user.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {roleLabels[user.role]}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedUserId(user.id)}
                title={`Ações de ${user.name}`}
                aria-label={`Ações de ${user.name}`}
              >
                <MoreHorizontal />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setOpen(false)}
        >
          <Card
            className="w-full max-w-md rounded-b-none p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <form className="space-y-4" onSubmit={create}>
              <h2 className="font-display text-xl font-bold">Criar usuário</h2>
              <Field label="Nome">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Senha temporária">
                <Input
                  required
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </Field>
              <Field label="Função">
                <select
                  className="h-11 w-full rounded-xl border bg-background px-3"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  {Object.entries(roleLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Meta diária">
                <Input
                  type="number"
                  min="0"
                  value={form.daily_goal}
                  onChange={(e) =>
                    setForm({ ...form, daily_goal: Number(e.target.value) })
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button>Criar usuário</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"
          onClick={() => setSelectedUserId(null)}
        >
          <Card className="w-full max-w-md rounded-b-none p-5 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 border-b pb-4">
              <ProfileAvatar src={selectedUser.avatar_url} name={selectedUser.name} className="size-11" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg font-semibold">{selectedUser.name}</h2>
                <p className="truncate text-xs text-muted-foreground">{selectedUser.email}</p>
              </div>
              <Badge className="ml-auto" variant={selectedUser.is_active ? "success" : "danger"}>{selectedUser.is_active ? "Ativo" : "Inativo"}</Badge>
            </div>
            <div className="space-y-4 py-4">
              <div><p className="text-xs text-muted-foreground">Função</p><p className="mt-1 text-sm font-medium">{roleLabels[selectedUser.role]}</p></div>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Meta diária</span>
                <div className="flex gap-2">
                  <Input className="min-w-0" type="number" min="0" step="1" value={goalDrafts[selectedUser.id] ?? String(selectedUser.daily_goal ?? 0)} onChange={(event) => setGoalDrafts((current) => ({ ...current, [selectedUser.id]: event.target.value }))} />
                  <Button variant="outline" onClick={() => saveGoal(selectedUser.id)} disabled={savingGoal === selectedUser.id}><Save />Salvar</Button>
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t pt-4">
              <Button variant="outline" onClick={() => setSelectedUserId(null)}>Fechar</Button>
              <Button variant={selectedUser.is_active ? "destructive" : "default"} onClick={() => toggle(selectedUser.id, selectedUser.is_active)}>{selectedUser.is_active ? "Desativar acesso" : "Ativar acesso"}</Button>
            </div>
          </Card>
        </div>
      )}
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
