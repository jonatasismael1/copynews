import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const roles = ["admin", "editor", "writer", "viewer"] as const;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function validRole(value: unknown): value is (typeof roles)[number] {
  return typeof value === "string" && roles.includes(value as never);
}

function validGoal(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

async function context(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();
  if (!profile) throw new Error("Inactive user");
  return { user, profile };
}

const adminClient = () =>
  createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
      console.error(JSON.stringify({ message, status }));
      return json({ error: message }, status);
    }
  };
}

Deno.serve(
  handler(async (req) => {
    const { user, profile } = await context(req);
    if (profile.role !== "admin") throw new Error("Forbidden");
    const body = await req.json();
    const admin = adminClient();

    if (body.action === "create") {
      if (!body.email || !body.password || !body.name)
        throw new Error("Campos obrigatórios ausentes");
      const role = body.role ?? "writer";
      if (!validRole(role)) throw new Error("Função inválida");
      if (body.daily_goal !== undefined && !validGoal(body.daily_goal))
        throw new Error("Meta diária inválida");
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name: body.name },
        app_metadata: { role },
      });
      if (error) throw error;
      const { error: profileError } = await admin
        .from("profiles")
        .update({
          name: body.name,
          role,
          daily_goal: body.daily_goal ?? null,
        })
        .eq("id", data.user.id);
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "user.created",
        entity_type: "profile",
        entity_id: data.user.id,
        after_data: { email: body.email, role, daily_goal: body.daily_goal ?? null },
      });
      return json({ id: data.user.id }, 201);
    }

    if (body.action === "update") {
      if (!body.id) throw new Error("Usuário ausente");
      if (body.role !== undefined && !validRole(body.role))
        throw new Error("Função inválida");
      if (body.daily_goal !== undefined && !validGoal(body.daily_goal))
        throw new Error("Meta diária inválida");
      const allowed: Record<string, unknown> = {};
      for (const key of ["name", "role", "is_active", "daily_goal"])
        if (body[key] !== undefined) allowed[key] = body[key];
      if (!Object.keys(allowed).length) throw new Error("Nenhuma alteração informada");
      const { error } = await admin.from("profiles").update(allowed).eq("id", body.id);
      if (error) throw error;
      if (body.role)
        await admin.auth.admin.updateUserById(body.id, {
          app_metadata: { role: body.role },
        });
      await admin.from("audit_logs").insert({
        user_id: user.id,
        action: "user.updated",
        entity_type: "profile",
        entity_id: body.id,
        after_data: allowed,
      });
      return json({ ok: true });
    }

    throw new Error("Ação inválida");
  }),
);
