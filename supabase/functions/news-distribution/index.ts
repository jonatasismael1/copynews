import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (name: string) => { const value = Deno.env.get(name)?.trim(); if (!value) throw new Error(`Missing environment variable: ${name}`); return value.replace(/^['"]|['"]$/g, ""); };

async function context(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await client.from("profiles").select("id,role,is_active,organization_id").eq("id", user.id).single();
  if (!profile?.is_active) throw new Error("Unauthorized");
  const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"));
  return { client, admin, user, profile };
}
function safeError(error: unknown) { if (error && typeof error === "object" && "message" in error) return String(error.message).slice(0, 300); return "Não foi possível concluir a solicitação"; }
function normalizePhone(value: unknown) { const phone = String(value || "").replace(/\D/g, ""); if (!/^55[1-9][0-9]{9,10}$/.test(phone)) throw new Error("Telefone inválido"); return phone; }
function normalizeUrl(value: unknown) {
  const url = new URL(String(value || "").trim());
  if (!["http:", "https:"].includes(url.protocol) || ["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new Error("URL inválida");
  url.hash = "";
  if (url.hostname.replace(/^www\./, "") === "instagram.com") { const match = url.pathname.match(/^\/(p|reel|reels|tv)\/([^/]+)/i); if (match) return `https://www.instagram.com/${match[1].toLowerCase() === "reels" ? "reel" : match[1].toLowerCase()}/${match[2]}/`; }
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|igsh|fbclid|gclid|ref|share)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}
const pendingSteps = () => ({ link: { status: "pending" }, media: [], title_label: { status: "pending" }, title_content: { status: "pending" }, caption_label: { status: "pending" }, caption_content: { status: "pending" } });

async function enqueue(ctx: Awaited<ReturnType<typeof context>>, body: Record<string, unknown>) {
  if (!["admin", "editor", "writer"].includes(ctx.profile.role)) throw new Error("Forbidden");
  const newsId = String(body.news_id || ""); const recipientId = String(body.recipient_id || "");
  const [{ data: recipient }, { data: news }] = await Promise.all([
    ctx.admin.from("distribution_recipients").select("*").eq("id", recipientId).eq("organization_id", ctx.profile.organization_id).eq("is_active", true).single(),
    ctx.client.from("news_items").select("id,source_url,original_title").eq("id", newsId).is("archived_at", null).single(),
  ]);
  if (!recipient || !news) throw new Error("Notícia ou destinatário inválido");
  const phone = normalizePhone(recipient.phone);
  const testMode = (Deno.env.get("DISTRIBUTION_TEST_MODE") || "true").toLowerCase() !== "false";
  const testPhone = normalizePhone(Deno.env.get("DISTRIBUTION_TEST_PHONE") || "5582998264805");
  if (testMode && phone !== testPhone) throw new Error("Durante os testes, somente Ismael pode receber mensagens");
  const { data: active } = await ctx.admin.from("news_send_history").select("id,status,created_at").eq("organization_id", ctx.profile.organization_id).eq("news_id", newsId).eq("recipient_id", recipientId).in("status", ["queued", "processing"]).limit(1).maybeSingle();
  if (active) return json({ duplicate: true, active: true, previous: active }, 409);
  if (!body.force_resend) {
    const { data: duplicate } = await ctx.admin.from("news_send_history").select("id,status,sent_at,created_at").eq("organization_id", ctx.profile.organization_id).eq("news_id", newsId).eq("recipient_id", recipientId).in("status", ["success", "partial"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (duplicate) return json({ duplicate: true, previous: duplicate }, 409);
  }
  const { data, error } = await ctx.admin.from("news_send_history").insert({ organization_id: ctx.profile.organization_id, news_id: newsId, source_type: "existing_news", recipient_id: recipientId, source_url: news.source_url, news_title: news.original_title, recipient_name: recipient.name, recipient_vehicle: recipient.vehicle, recipient_phone: phone, status: "queued", steps: pendingSteps(), queued_at: new Date().toISOString(), created_by: ctx.user.id }).select("id,status,queued_at").single();
  if (error) throw new Error(error.code === "23505" ? "Este envio já está na fila" : error.message);
  return json(data, 202);
}

async function resolveDirect(ctx: Awaited<ReturnType<typeof context>>, body: Record<string, unknown>) {
  if (!["admin", "editor", "writer"].includes(ctx.profile.role)) throw new Error("Forbidden");
  const sourceUrl = String(body.source_url || "").trim(); const normalized = normalizeUrl(sourceUrl); const shortcode = normalized.match(/instagram\.com\/(?:p|reel|tv)\/([^/]+)/i)?.[1];
  let query = ctx.client.from("news_items").select("id,source_url,original_title").is("archived_at", null);
  query = shortcode ? query.ilike("source_url", `%/${shortcode}/%`) : query.eq("source_url", normalized);
  const { data: existing } = await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing) return json({ type: "existing_news", news: existing, normalized_url: normalized });
  return json({ type: "not_found", normalized_url: normalized });
}

async function createPreview(ctx: Awaited<ReturnType<typeof context>>, body: Record<string, unknown>) { const sourceUrl = String(body.source_url || "").trim(); const normalized = normalizeUrl(sourceUrl); const { data, error } = await ctx.client.from("distribution_direct_previews").insert({ organization_id: ctx.profile.organization_id, source_url: sourceUrl, normalized_url: normalized, created_by: ctx.user.id }).select().single(); if (error) throw error; return json(data, 202); }

async function enqueueDirect(ctx: Awaited<ReturnType<typeof context>>, body: Record<string, unknown>) {
  if (!["admin", "editor", "writer"].includes(ctx.profile.role)) throw new Error("Forbidden");
  const previewId = String(body.preview_id || ""); const recipientId = String(body.recipient_id || "");
  const [{ data: preview }, { data: recipient }] = await Promise.all([ctx.admin.from("distribution_direct_previews").select("*").eq("id", previewId).eq("organization_id", ctx.profile.organization_id).eq("status", "ready").single(), ctx.admin.from("distribution_recipients").select("*").eq("id", recipientId).eq("organization_id", ctx.profile.organization_id).eq("is_active", true).single()]);
  if (!preview || !recipient) throw new Error("Prévia ou destinatário inválido");
  const phone = normalizePhone(recipient.phone); const testMode = (Deno.env.get("DISTRIBUTION_TEST_MODE") || "true").toLowerCase() !== "false"; const testPhone = normalizePhone(Deno.env.get("DISTRIBUTION_TEST_PHONE") || "5582998264805"); if (testMode && phone !== testPhone) throw new Error("Durante os testes, somente Ismael pode receber mensagens");
  const payload = { original_title: preview.original_title, original_caption: preview.original_caption, title_state: preview.title_state, caption_state: preview.caption_state, media_kind: preview.media_kind, media_count: preview.media_count };
  const { data, error } = await ctx.admin.from("news_send_history").insert({ organization_id: ctx.profile.organization_id, news_id: null, source_type: "direct_url", direct_payload: payload, recipient_id: recipientId, source_url: preview.source_url, news_title: preview.original_title, recipient_name: recipient.name, recipient_vehicle: recipient.vehicle, recipient_phone: phone, status: "queued", steps: pendingSteps(), queued_at: new Date().toISOString(), created_by: ctx.user.id }).select("id,status,queued_at").single();
  if (error) throw new Error(error.code === "23505" ? "Este envio já está na fila" : error.message); return json(data, 202);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ctx = await context(req); const body = await req.json() as Record<string, unknown>; const action = String(body.action || "");
    if (action === "send") return enqueue(ctx, body);
    if (action === "resolve_url") return resolveDirect(ctx, body);
    if (action === "create_preview") return createPreview(ctx, body);
    if (action === "preview") { const { data, error } = await ctx.client.from("distribution_direct_previews").select("*").eq("id", String(body.preview_id || "")).single(); if (error) throw error; return json(data); }
    if (action === "send_direct") return enqueueDirect(ctx, body);
    if (action === "list") {
      const [recipients, history] = await Promise.all([ctx.client.from("distribution_recipients").select("*").order("is_active", { ascending: false }).order("name"), ctx.client.from("news_send_history").select("*").order("created_at", { ascending: false }).limit(200)]);
      if (recipients.error || history.error) throw recipients.error || history.error;
      return json({ recipients: recipients.data, history: history.data });
    }
    if (ctx.profile.role !== "admin") throw new Error("Forbidden");
    if (action === "create") {
      const { data, error } = await ctx.client.from("distribution_recipients").insert({ organization_id: ctx.profile.organization_id, name: String(body.name || "").trim(), vehicle: String(body.vehicle || "").trim(), phone: normalizePhone(body.phone), is_active: body.is_active !== false, created_by: ctx.user.id }).select().single();
      if (error) throw error; return json(data, 201);
    }
    if (action === "update") {
      const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["name", "vehicle", "is_active"]) if (key in body) values[key] = typeof body[key] === "string" ? String(body[key]).trim() : body[key];
      if ("phone" in body) values.phone = normalizePhone(body.phone);
      const { data, error } = await ctx.client.from("distribution_recipients").update(values).eq("id", String(body.id)).select().single();
      if (error) throw error; return json(data);
    }
    if (action === "delete") { const { error } = await ctx.client.from("distribution_recipients").delete().eq("id", String(body.id)); if (error) throw error; return json({ deleted: true }); }
    throw new Error("Ação inválida");
  } catch (error) {
    const message = safeError(error); const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    console.error(JSON.stringify({ event: "distribution.request_failed", status, message })); return json({ error: message }, status);
  }
});
