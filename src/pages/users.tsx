import { useState } from "react";
import { MoreHorizontal, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useProfiles } from "@/hooks/use-data";
import { useAuth } from "@/providers/auth-provider";
import { supabase } from "@/lib/supabase";
import { roleLabels } from "@/lib/constants";
export function UsersPage() {
  const { profile } = useAuth();
  const { data = [], refetch } = useProfiles();
  const [open, setOpen] = useState(false);
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [savingGoal, setSavingGoal] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "writer",
    daily_goal: 10,
  });
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
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
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
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-secondary">
                <UserRound size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <Badge variant={user.is_active ? "success" : "danger"}>
                  {user.is_active ? "Ativo" : "Inativo"}
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  {roleLabels[user.role]}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <label>
                  <span className="mb-1 block text-xs text-muted-foreground">
                    Meta diária
                  </span>
                  <Input
                    className="w-24"
                    type="number"
                    min="0"
                    step="1"
                    aria-label={`Meta diária de ${user.name}`}
                    value={
                      goalDrafts[user.id] ?? String(user.daily_goal ?? 0)
                    }
                    onChange={(e) =>
                      setGoalDrafts((current) => ({
                        ...current,
                        [user.id]: e.target.value,
                      }))
                    }
                  />
                </label>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => saveGoal(user.id)}
                  disabled={savingGoal === user.id}
                  title={`Salvar meta de ${user.name}`}
                >
                  <Save />
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggle(user.id, user.is_active)}
                title={user.is_active ? "Desativar" : "Ativar"}
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
