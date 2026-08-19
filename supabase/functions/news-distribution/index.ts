import { createClient } from "jsr:@supabase/supabase-js@2";
import { externalizeStorageUrl } from "../_shared/public-url.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const env = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value.replace(/^['"]|['"]$/g, "");
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Context = Awaited<ReturnType<typeof context>>;
type SendStep = "link" | "media" | "title" | "caption";
type StepState = { status: "pending" | "sent" | "failed"; message_id?: string; error?: string };

async function context(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await userClient.from("profiles")
    .select("id,role,is_active,organization_id").eq("id", user.id).single();
  if (!profile?.is_active) throw new Error("Unauthorized");
  const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"));
  return { userClient, admin, user, profile };
}

function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error || "Falha inesperada");
  return value.replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 300);
}
function normalizePhone(value: unknown) {
  const phone = String(value || "").replace(/\D/g, "");
  if (!/^55[1-9][0-9]{9,10}$/.test(phone)) throw new Error("Telefone inválido");
  return phone;
}
function safeName(value: string, fallback: string) {
  const clean = value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || fallback).slice(0, 100);
}
function messageId(payload: Record<string, unknown>) {
  const key = payload.key as Record<string, unknown> | undefined;
  const data = payload.data as Record<string, unknown> | undefined;
  return String(key?.id || data?.key && (data.key as Record<string, unknown>).id || payload.messageId || payload.id || "") || null;
}

class EvolutionService {
  private base = env("EVOLUTION_API_URL").replace(/\/$/, "");
  // Distribution uses its own instance without changing the instance that
  // already delivers Instagram collection reports.
  private instance = Deno.env.get("DISTRIBUTION_EVOLUTION_INSTANCE")?.trim() || env("EVOLUTION_INSTANCE");
  private apiKey = Deno.env.get("DISTRIBUTION_EVOLUTION_API_KEY")?.trim() || env("EVOLUTION_API_KEY");

  private async post(path: string, body: Record<string, unknown>) {
    let last = "Evolution indisponível";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${this.base}${path}/${this.instance}`, {
          method: "POST",
          headers: { apikey: this.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
        console.log(JSON.stringify({ event: response.ok ? "distribution.sent" : "distribution.failed", response_status: response.status, attempt }));
        if (response.ok) return { id: messageId(payload), payload };
        last = `Evolution HTTP ${response.status}`;
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        last = safeError(error);
      }
      if (attempt < 3) await sleep(attempt * 600);
    }
    throw new Error(last);
  }

  sendText(phone: string, text: string) {
    return this.post("/message/sendText", { number: phone, text });
  }
  sendDocument(phone: string, bytes: Uint8Array, mimeType: string, filename: string) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return this.post("/message/sendMedia", {
      number: phone,
      mediatype: "document",
      mimetype: mimeType,
      media: btoa(binary),
      fileName: filename,
    });
  }
  sendDocumentUrl(phone: string, url: string, filename: string) {
    const extension = filename.split(".").pop()?.toLowerCase();
    const mimeType = extension === "mp4" ? "video/mp4" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
    return this.post("/message/sendMedia", {
      number: phone,
      mediatype: "document",
      mimetype: mimeType,
      media: url,
      fileName: filename,
    });
  }
}

function allowedSource(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return ["instagram.com", "www.instagram.com", "tiktok.com", "www.tiktok.com", "youtu.be", "youtube.com", "www.youtube.com", "facebook.com", "www.facebook.com"].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

async function cobaltMedia(sourceUrl: string) {
  if (!allowedSource(sourceUrl)) throw new Error("A mídia temporária não está mais disponível");
  const response = await fetch(env("COBALT_API_URL").replace(/\/$/, ""), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Api-Key ${env("COBALT_API_KEY")}` },
    body: JSON.stringify({ url: sourceUrl, downloadMode: "auto", videoQuality: "1080", filenameStyle: "basic" }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.status === "error") throw new Error("Não foi possível obter a mídia original");
  if (payload.status === "picker") return ((payload.picker || []) as Record<string, unknown>[]).filter((item) => item.url).map((item, index) => ({
    url: String(item.url), filename: String(item.filename || `arquivo-${index + 1}`),
  }));
  if (["redirect", "tunnel"].includes(String(payload.status)) && payload.url) {
    let url = String(payload.url);
    if (payload.status === "tunnel") {
      const tunnel = new URL(url); const configured = new URL(env("COBALT_API_URL"));
      tunnel.protocol = configured.protocol; tunnel.host = configured.host; url = tunnel.toString();
    }
    return [{ url, filename: String(payload.filename || "arquivo") }];
  }
  throw new Error("A origem não retornou mídia compatível");
}

async function mediaSources(ctx: Context, news: Record<string, unknown>) {
  const paths = Array.isArray(news.temporary_media_paths) && news.temporary_media_paths.length
    ? news.temporary_media_paths.map(String)
    : news.temporary_media_path ? [String(news.temporary_media_path)] : [];
  if (paths.length) {
    const { data, error } = await ctx.admin.storage.from("temporary-media").createSignedUrls(paths, 600, { download: true });
    if (!error && data?.every((item) => item.signedUrl)) return data.map((item, index) => ({ url: externalizeStorageUrl(item.signedUrl), filename: paths[index].split("/").pop() || `arquivo-${index + 1}` }));
  }
  return cobaltMedia(String(news.source_url));
}

async function downloadToTemp(sources: { url: string; filename: string }[]) {
  const dir = await Deno.makeTempDir({ prefix: "copy-news-send-" });
  const files: { path: string; name: string; mime: string }[] = [];
  let total = 0;
  try {
    for (const [index, source] of sources.entries()) {
      const response = await fetch(source.url, { redirect: "follow", signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`Download da mídia falhou (${response.status})`);
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > 100 * 1024 * 1024) throw new Error("Arquivo excede o limite de 100 MB");
      const bytes = new Uint8Array(await response.arrayBuffer());
      total += bytes.length;
      if (bytes.length === 0 || bytes.length > 100 * 1024 * 1024 || total > 200 * 1024 * 1024) throw new Error("Mídia vazia ou acima do limite permitido");
      const mime = (response.headers.get("content-type") || "application/octet-stream").split(";")[0];
      const extension = mime === "video/mp4" ? ".mp4" : mime === "image/png" ? ".png" : mime.startsWith("image/") ? ".jpg" : "";
      const name = safeName(source.filename, `arquivo-${index + 1}${extension}`);
      const finalName = /\.[a-z0-9]{2,5}$/i.test(name) ? name : `${name}${extension}`;
      const path = `${dir}/${index}-${finalName}`;
      await Deno.writeFile(path, bytes);
      files.push({ path, name: finalName, mime });
    }
    return { dir, files };
  } catch (error) {
    await Deno.remove(dir, { recursive: true }).catch(() => undefined);
    throw error;
  }
}

async function sendNews(ctx: Context, body: Record<string, unknown>) {
  if (!["admin", "editor", "writer"].includes(ctx.profile.role)) throw new Error("Forbidden");
  const newsId = String(body.news_id || "");
  const recipientId = String(body.recipient_id || "");
  const { data: recipient } = await ctx.admin.from("distribution_recipients").select("*")
    .eq("id", recipientId).eq("organization_id", ctx.profile.organization_id).eq("is_active", true).single();
  const { data: news } = await ctx.admin.from("news_items").select("id,source_url,original_title,source_caption,original_caption,clean_original_caption,temporary_media_path,temporary_media_paths")
    .eq("id", newsId).is("archived_at", null).single();
  if (!recipient || !news) throw new Error("Notícia ou destinatário inválido");
  const phone = normalizePhone(recipient.phone);
  const testMode = (Deno.env.get("DISTRIBUTION_TEST_MODE") || "true").toLowerCase() !== "false";
  const testPhone = normalizePhone(Deno.env.get("DISTRIBUTION_TEST_PHONE") || "5582998264805");
  if (testMode && phone !== testPhone) throw new Error("Durante os testes, somente Ismael pode receber mensagens");
  const { data: activeHistory } = await ctx.admin.from("news_send_history").select("id,steps,status")
    .eq("organization_id", ctx.profile.organization_id).eq("news_id", newsId).eq("recipient_id", recipientId)
    .eq("status", "sending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!body.force_resend && !activeHistory) {
    const { data: duplicate } = await ctx.admin.from("news_send_history").select("id,sent_at,created_at,status")
      .eq("organization_id", ctx.profile.organization_id).eq("news_id", newsId).eq("recipient_id", recipientId)
      .in("status", ["sending", "success", "partial"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (duplicate) return json({ duplicate: true, previous: duplicate }, 409);
  }
  let history = activeHistory;
  if (!history) {
    const created = await ctx.admin.from("news_send_history").insert({
      organization_id: ctx.profile.organization_id, news_id: newsId, recipient_id: recipientId,
      source_url: news.source_url, news_title: news.original_title, recipient_name: recipient.name,
      recipient_vehicle: recipient.vehicle, recipient_phone: phone, created_by: ctx.user.id,
    }).select("id,steps,status").single();
    if (created.error) throw new Error(created.error.code === "23505" ? "Este envio já está em andamento" : "Não foi possível iniciar o envio");
    history = created.data;
  }
  const defaults: Record<string, StepState | StepState[]> = {
    link: { status: "pending" }, media: [], title: { status: "pending" }, caption: { status: "pending" },
  };
  const steps = { ...defaults, ...((history.steps || {}) as Record<string, StepState | StepState[]>) };
  const evolution = new EvolutionService();
  let successes = 0; let failures = 0;
  const persist = async () => {
    const mediaSteps = steps.media as StepState[];
    await ctx.admin.from("news_send_history").update({
      steps,
      link_message_id: (steps.link as StepState).message_id || null,
      media_message_ids: mediaSteps.filter((step) => step.message_id).map((step) => step.message_id),
      title_message_id: (steps.title as StepState).message_id || null,
      caption_message_id: (steps.caption as StepState).message_id || null,
      updated_at: new Date().toISOString(),
    }).eq("id", history.id);
  };
  const apply = async (step: SendStep, action: () => Promise<{ id: string | null }>) => {
    if ((steps[step] as StepState).status === "sent") return;
    try { const result = await action(); steps[step] = { status: "sent", ...(result.id ? { message_id: result.id } : {}) }; successes += 1; }
    catch (error) { steps[step] = { status: "failed", error: safeError(error) }; failures += 1; }
    await persist();
    await sleep(700);
  };
  await apply("link", () => evolution.sendText(phone, `🔗 *Publicação original*\n${news.source_url}`));
  const existingMedia = steps.media as StepState[];
  if (!existingMedia.length || existingMedia.some((step) => step.status !== "sent")) {
    try {
      const sources = await mediaSources(ctx, news);
      const mediaSteps: StepState[] = [];
      for (const source of sources) {
        try {
          const result = await evolution.sendDocumentUrl(phone, source.url, safeName(source.filename, "arquivo"));
          mediaSteps.push({ status: "sent", ...(result.id ? { message_id: result.id } : {}) }); successes += 1;
        } catch (error) { mediaSteps.push({ status: "failed", error: safeError(error) }); failures += 1; }
        steps.media = mediaSteps; await persist(); await sleep(700);
      }
    } catch (error) { steps.media = [{ status: "failed", error: safeError(error) }]; failures += 1; await persist(); }
  }
  const originalTitle = String(news.original_title || "").trim() || "Não há título na imagem.";
  await apply("title", () => evolution.sendText(phone, `📰 *TÍTULO*\n\n${originalTitle}`));
  const originalCaption = String(news.original_caption || news.clean_original_caption || news.source_caption || "").trim() || "Não há legenda.";
  await apply("caption", () => evolution.sendText(phone, `📝 *LEGENDA DA PUBLICAÇÃO*\n\n${originalCaption}`));
  const status = failures === 0 ? "success" : successes > 0 ? "partial" : "failed";
  const mediaSteps = steps.media as StepState[];
  const errorMessage = status === "success" ? null : Object.values(steps).flat().filter((step) => step.status === "failed").map((step) => step.error).filter(Boolean).join("; ").slice(0, 500);
  await ctx.admin.from("news_send_history").update({
    status, sent_at: new Date().toISOString(), steps, error_message: errorMessage,
    link_message_id: (steps.link as StepState).message_id || null,
    media_message_ids: mediaSteps.filter((step) => step.message_id).map((step) => step.message_id),
    title_message_id: (steps.title as StepState).message_id || null,
    caption_message_id: (steps.caption as StepState).message_id || null,
    updated_at: new Date().toISOString(),
  }).eq("id", history.id);
  return json({ id: history.id, status, steps });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const ctx = await context(req);
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action || "");
    if (action === "send") return sendNews(ctx, body);
    if (action === "list") {
      const [recipients, history] = await Promise.all([
        ctx.userClient.from("distribution_recipients").select("*").order("is_active", { ascending: false }).order("name"),
        ctx.userClient.from("news_send_history").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      if (recipients.error || history.error) throw recipients.error || history.error;
      return json({ recipients: recipients.data, history: history.data });
    }
    if (!["admin"].includes(ctx.profile.role)) throw new Error("Forbidden");
    if (action === "create") {
      const phone = normalizePhone(body.phone);
      const { data, error } = await ctx.userClient.from("distribution_recipients").insert({ organization_id: ctx.profile.organization_id, name: String(body.name || "").trim(), vehicle: String(body.vehicle || "").trim(), phone, is_active: body.is_active !== false, created_by: ctx.user.id }).select().single();
      if (error) throw error; return json(data, 201);
    }
    if (action === "update") {
      const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const key of ["name", "vehicle", "is_active"]) if (key in body) values[key] = typeof body[key] === "string" ? String(body[key]).trim() : body[key];
      if ("phone" in body) values.phone = normalizePhone(body.phone);
      const { data, error } = await ctx.userClient.from("distribution_recipients").update(values).eq("id", String(body.id)).select().single();
      if (error) throw error; return json(data);
    }
    if (action === "delete") {
      const { error } = await ctx.userClient.from("distribution_recipients").delete().eq("id", String(body.id));
      if (error) throw error; return json({ deleted: true });
    }
    throw new Error("Ação inválida");
  } catch (error) {
    const message = safeError(error);
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    console.error(JSON.stringify({ event: "distribution.request_failed", status, message }));
    return json({ error: message }, status);
  }
});
