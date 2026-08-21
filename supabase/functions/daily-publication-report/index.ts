import { createClient } from "jsr:@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value.replace(/^['"]|['"]$/g, "");
};
const safe = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 300) : "Erro inesperado";
const phone = (value: string) => value.replace(/\D/g, "");
const markdownName = (value: unknown) =>
  String(value || "Usuário")
    .replace(/[\r\n*_~`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
async function authorize(req: Request, admin: ReturnType<typeof createClient>) {
  const cron = req.headers.get("x-cron-secret");
  const expected =
    Deno.env.get("SYNC_INSTAGRAM_CRON_SECRET") ||
    Deno.env.get("META_SYNC_CRON_SECRET");
  if (cron && expected && cron === expected) return;
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active || profile.role !== "admin")
    throw new Error("Forbidden");
}
function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
async function sendText(number: string, text: string) {
  const base = env("EVOLUTION_API_URL").replace(/\/$/, "");
  const instance = env("EVOLUTION_INSTANCE");
  let last = "Evolution indisponível";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${base}/message/sendText/${instance}`, {
        method: "POST",
        headers: {
          apikey: env("EVOLUTION_API_KEY"),
          "content-type": "application/json",
        },
        body: JSON.stringify({ number: phone(number), text }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({}));
      console.log(
        JSON.stringify({
          event: response.ok ? "daily_report.sent" : "daily_report.failed",
          responseStatus: response.status,
          attempt,
        }),
      );
      if (response.ok)
        return String(payload?.key?.id || payload?.messageId || "");
      last = `Evolution HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      last = safe(error);
    }
    if (attempt < 3)
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
  }
  throw new Error(last);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  try {
    await authorize(req, admin);
    const reportDate = localDate();
    const from = new Date(`${reportDate}T00:00:00-03:00`).toISOString();
    const to = new Date(new Date(from).getTime() + 86400000).toISOString();
    const { data: organizations, error: orgError } = await admin
      .from("organizations")
      .select("id,name");
    if (orgError) throw orgError;
    const results = [];
    for (const organization of organizations || []) {
      const { data: existing } = await admin
        .from("daily_publication_report_runs")
        .select("id,status")
        .eq("organization_id", organization.id)
        .eq("report_date", reportDate)
        .maybeSingle();
      if (existing?.status === "sent") {
        results.push({
          organization_id: organization.id,
          status: "already_sent",
        });
        continue;
      }
      const { data: run, error: runError } = existing
        ? await admin
            .from("daily_publication_report_runs")
            .update({ status: "processing", error_message: null })
            .eq("id", existing.id)
            .select("id")
            .single()
        : await admin
            .from("daily_publication_report_runs")
            .insert({
              organization_id: organization.id,
              report_date: reportDate,
              status: "processing",
            })
            .select("id")
            .single();
      if (runError) throw runError;
      try {
        const [
          { data: profiles, error: profileError },
          { data: recipients, error: recipientError },
        ] = await Promise.all([
          admin
            .from("profiles")
            .select("id,name,phone,is_active")
            .eq("organization_id", organization.id)
            .eq("is_active", true)
            .order("name"),
          admin
            .from("distribution_recipients")
            .select("id,profile_id")
            .eq("organization_id", organization.id)
            .not("profile_id", "is", null),
        ]);
        if (profileError || recipientError)
          throw profileError || recipientError;
        const profileIds = (profiles || []).map((item) => item.id);
        const recipientIds = (recipients || []).map((item) => item.id);
        let query = admin
          .from("publications")
          .select("id,posted_by,confirmed_recipient_id,source_type")
          .gte("published_at", from)
          .lt("published_at", to)
          .is("archived_at", null);
        if (profileIds.length || recipientIds.length) {
          const filters = [];
          if (profileIds.length)
            filters.push(`posted_by.in.(${profileIds.join(",")})`);
          if (recipientIds.length)
            filters.push(
              `confirmed_recipient_id.in.(${recipientIds.join(",")})`,
            );
          query = query.or(filters.join(","));
        } else query = query.eq("id", "00000000-0000-0000-0000-000000000000");
        const { data: publications, error: publicationError } = await query;
        if (publicationError) throw publicationError;
        const recipientProfiles = new Map(
          (recipients || []).map((item) => [item.id, item.profile_id]),
        );
        const counts = new Map(
          (profiles || []).map((item) => [
            item.id,
            { name: markdownName(item.name), copyNews: 0, external: 0 },
          ]),
        );
        for (const publication of publications || []) {
          const owner =
            publication.posted_by ||
            recipientProfiles.get(publication.confirmed_recipient_id);
          const row = owner ? counts.get(owner) : null;
          if (!row) continue;
          if (publication.source_type === "copy_news") row.copyNews++;
          else row.external++;
        }
        const rows = [...counts.values()];
        const totalCopy = rows.reduce((sum, row) => sum + row.copyNews, 0);
        const totalExternal = rows.reduce((sum, row) => sum + row.external, 0);
        const dateLabel = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Maceio",
        }).format(new Date(`${reportDate}T12:00:00-03:00`));
        const message = [
          "📊 *RELATÓRIO DIÁRIO DE PUBLICAÇÕES*",
          `Data: ${dateLabel}`,
          ...rows.flatMap((row) => [
            "",
            `*${row.name}*`,
            `Pelo Copy News: *${row.copyNews}*`,
            `Por fora (autoral): *${row.external}*`,
            `Total: *${row.copyNews + row.external}*`,
          ]),
          "",
          "*TOTAL GERAL*",
          `Pelo Copy News: *${totalCopy}*`,
          `Por fora (autoral): *${totalExternal}*`,
          `Publicações: *${totalCopy + totalExternal}*`,
        ].join("\n");
        const messageId = await sendText(env("INSTAGRAM_ALERT_PHONE"), message);
        await admin
          .from("daily_publication_report_runs")
          .update({
            status: "sent",
            message_id: messageId,
            sent_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", run.id);
        results.push({
          organization_id: organization.id,
          status: "sent",
          users: rows.length,
          total: totalCopy + totalExternal,
        });
      } catch (error) {
        await admin
          .from("daily_publication_report_runs")
          .update({ status: "failed", error_message: safe(error) })
          .eq("id", run.id);
        results.push({
          organization_id: organization.id,
          status: "failed",
          error: safe(error),
        });
      }
    }
    return json({ report_date: reportDate, results });
  } catch (error) {
    const message = safe(error);
    console.error(
      JSON.stringify({ event: "daily_report.request_failed", message }),
    );
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
