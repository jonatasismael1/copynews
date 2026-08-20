import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { spawn } from "node:child_process";
import { extractMetadata } from "./adapters.mjs";
import { normalizeHeadlineCase, readFrames } from "./openrouter.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeError = (error) => String(error?.message || error || "Falha inesperada").replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 400);
const normalizePhone = (value) => { const phone = String(value || "").replace(/\D/g, ""); if (!/^55[1-9][0-9]{9,10}$/.test(phone)) throw new Error("Telefone inválido"); return phone; };
const messageId = (payload) => String(payload?.key?.id || payload?.data?.key?.id || payload?.messageId || payload?.id || "") || null;
const safeFilename = (value, fallback) => (String(value || fallback).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback).slice(0, 100);

async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.on("data", (data) => (stdout += data)); child.stderr.on("data", (data) => (stderr += data)); child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${command} saiu com ${code}: ${stderr.slice(-500)}`)));
  });
}
async function execute(command, args) { await capture(command, args); }

async function probeVideo(path) {
  const payload = JSON.parse(await capture("ffprobe", ["-v", "error", "-show_entries", "format=format_name,duration,size:stream=index,codec_type,codec_name", "-of", "json", path]));
  const video = payload.streams?.find((stream) => stream.codec_type === "video"); const audio = payload.streams?.find((stream) => stream.codec_type === "audio");
  if (!video || !Number(payload.format?.duration) || !Number(payload.format?.size)) throw new Error("Vídeo inválido ou incompleto");
  return { container: payload.format.format_name, videoCodec: video.codec_name, audioCodec: audio?.codec_name || null, duration: Number(payload.format.duration), size: Number(payload.format.size) };
}
function isCompatibleVideo(probe) { return String(probe.container).split(",").some((name) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(name)) && probe.videoCodec === "h264" && (!probe.audioCodec || probe.audioCodec === "aac"); }
async function compatibleVideo(input, output) {
  const original = await probeVideo(input);
  if (isCompatibleVideo(original)) { await fs.copyFile(input, output); return { ...original, converted: false }; }
  await execute("ffmpeg", ["-y", "-v", "error", "-i", input, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
  const converted = await probeVideo(output); if (!isCompatibleVideo(converted)) throw new Error("Conversão não produziu MP4 H.264/AAC válido");
  return { ...converted, converted: true };
}
function imageMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: ".jpg" };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { mime: "image/png", extension: ".png" };
  if (String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return { mime: "image/webp", extension: ".webp" };
  return null;
}
async function fetchToFile(url, path) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error("Arquivo vazio ou acima de 100 MB");
  await fs.writeFile(path, bytes); return { bytes, contentType: (response.headers.get("content-type") || "").split(";")[0].toLowerCase() };
}
async function cobaltSources(sourceUrl) {
  const endpoint = `${process.env.COBALT_API_URL.replace(/\/+$/, "")}/`;
  const response = await fetch(endpoint, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", ...(process.env.COBALT_API_KEY ? { Authorization: `Api-Key ${process.env.COBALT_API_KEY}` } : {}) }, body: JSON.stringify({ url: sourceUrl, downloadMode: "auto", videoQuality: "1080", filenameStyle: "basic", alwaysProxy: true }), signal: AbortSignal.timeout(45_000) });
  const payload = await response.json().catch(() => ({})); if (!response.ok || payload.status === "error") throw new Error("Não foi possível obter a mídia original");
  if (payload.status === "picker") return (payload.picker || []).filter((item) => item.url).map((item, index) => ({ url: item.url, filename: item.filename || `arquivo-${index + 1}` }));
  if (["redirect", "tunnel"].includes(payload.status) && payload.url) { let url = payload.url; if (payload.status === "tunnel") { const tunnel = new URL(url); const base = new URL(process.env.COBALT_API_URL); tunnel.protocol = base.protocol; tunnel.host = base.host; url = tunnel.toString(); } return [{ url, filename: payload.filename || "arquivo" }]; }
  throw new Error("A origem não retornou mídia compatível");
}

class EvolutionService {
  constructor(log) { this.log = log; this.base = process.env.DISTRIBUTION_EVOLUTION_URL.replace(/\/$/, ""); this.instance = process.env.DISTRIBUTION_EVOLUTION_INSTANCE; this.apiKey = process.env.DISTRIBUTION_EVOLUTION_API_KEY; }
  async post(path, body) {
    let last = "Evolution indisponível";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${this.base}${path}/${this.instance}`, { method: "POST", headers: { apikey: this.apiKey, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
        const payload = await response.json().catch(() => ({})); this.log(response.ok ? "distribution.message.sent" : "distribution.message.failed", { responseStatus: response.status, attempt });
        if (response.ok) return messageId(payload); last = `Evolution HTTP ${response.status}`; if (response.status < 500 && response.status !== 429) break;
      } catch (error) { last = safeError(error); }
      if (attempt < 3) await sleep(attempt * 700);
    }
    throw new Error(last);
  }
  text(phone, text) { return this.post("/message/sendText", { number: phone, text }); }
  document(phone, path, mime, filename) { return fs.readFile(path).then((bytes) => this.post("/message/sendMedia", { number: phone, mediatype: "document", mimetype: mime, media: bytes.toString("base64"), fileName: filename })); }
}

export function createDistributionProcessor({ db, workerId, log }) {
  const required = ["DISTRIBUTION_EVOLUTION_URL", "DISTRIBUTION_EVOLUTION_INSTANCE", "DISTRIBUTION_EVOLUTION_API_KEY"];
  const configured = required.every((key) => process.env[key]);

  async function claim() {
    if (!configured) return null;
    const expired = new Date().toISOString();
    const { data: rows, error } = await db.from("news_send_history").select("*").in("status", ["queued", "processing"]).or(`lease_expires_at.is.null,lease_expires_at.lt.${expired}`).order("queued_at").limit(1);
    if (error) throw error; const job = rows?.[0]; if (!job) return null;
    const { data, error: claimError } = await db.from("news_send_history").update({ status: "processing", processing_started_at: job.processing_started_at || new Date().toISOString(), attempts: job.attempts + 1, lease_owner: workerId, lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", job.status).eq("attempts", job.attempts).select().maybeSingle();
    return claimError || !data ? null : data;
  }

  async function claimPreview() {
    const expired = new Date().toISOString();
    const { data: rows, error } = await db.from("distribution_direct_previews").select("*").in("status", ["queued", "processing"]).or(`lease_expires_at.is.null,lease_expires_at.lt.${expired}`).order("created_at").limit(1);
    if (error) throw error; const preview = rows?.[0]; if (!preview) return null;
    const { data } = await db.from("distribution_direct_previews").update({ status: "processing", attempts: preview.attempts + 1, lease_owner: workerId, lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", preview.id).eq("status", preview.status).eq("attempts", preview.attempts).select().maybeSingle();
    return data;
  }

  async function processPreview(preview) {
    const dir = join(tmpdir(), `copy-news-preview-${preview.id}`); const framesDir = join(dir, "frames"); await fs.mkdir(framesDir, { recursive: true });
    let metadata = null;
    try {
      metadata = await extractMetadata(preview.source_url); const sources = await cobaltSources(preview.source_url); const files = [];
      for (const [index, source] of sources.entries()) { const input = join(dir, `source-${index}${extname(source.filename) || ".bin"}`); const downloaded = await fetchToFile(source.url, input); files.push({ input, ...downloaded }); }
      let mediaKind = files.length > 1 ? "carousel" : "video";
      for (const [index, file] of files.entries()) { const image = imageMime(file.bytes); if (files.length === 1 && image) mediaKind = "image"; const output = join(framesDir, `frame-${index}-%02d.jpg`); await execute("ffmpeg", image ? ["-y", "-v", "error", "-i", file.input, "-vf", "scale=960:-1", "-frames:v", "1", "-q:v", "4", output] : ["-y", "-v", "error", "-i", file.input, "-vf", "fps=1/5,scale=960:-1", "-frames:v", "4", "-q:v", "4", output]); }
      const frames = await Promise.all((await fs.readdir(framesDir)).sort().slice(0, 8).map(async (name) => (await fs.readFile(join(framesDir, name))).toString("base64")));
      let ocr = null; let titleState = "absent";
      try { ocr = frames.length ? await readFrames(frames, process.env.OPENROUTER_API_KEY, process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4.1-mini") : null; titleState = ocr?.title ? "found" : "absent"; } catch { titleState = "failed"; }
      const caption = String(metadata?.caption || "").trim(); const captionState = caption ? "found" : metadata?.provider === "none" ? "failed" : "absent";
      await db.from("distribution_direct_previews").update({ status: "ready", media_kind: mediaKind, media_count: files.length, original_title: ocr?.title ? normalizeHeadlineCase(ocr.title, caption) : null, original_caption: caption || null, title_state: titleState, caption_state: captionState, error_message: null, lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", preview.id);
      log("distribution.preview.ready", { previewId: preview.id, mediaKind, mediaCount: files.length, titleState, captionState });
    } catch (error) {
      const caption = String(metadata?.caption || "").trim();
      await db.from("distribution_direct_previews").update({ status: "ready", media_kind: "unavailable", media_count: 0, original_title: null, original_caption: caption || null, title_state: "failed", caption_state: caption ? "found" : metadata?.provider === "none" ? "failed" : "absent", error_message: safeError(error), lease_owner: null, lease_expires_at: null, updated_at: new Date().toISOString() }).eq("id", preview.id);
      log("distribution.preview.ready_without_media", { previewId: preview.id, message: safeError(error) });
    }
    finally { await fs.rm(dir, { recursive: true, force: true }); }
  }

  async function processJob(job) {
    const dir = join(tmpdir(), `copy-news-distribution-${job.id}`); await fs.mkdir(dir, { recursive: true });
    const steps = { link: { status: "pending" }, media: [], title_label: { status: "pending" }, title_content: { status: "pending" }, caption_label: { status: "pending" }, caption_content: { status: "pending" }, ...(job.steps || {}) };
    const evolution = new EvolutionService(log); let sent = 0; let failed = 0;
    const persist = async (extra = {}) => {
      const media = steps.media || [];
      await db.from("news_send_history").update({ steps, link_message_id: steps.link?.message_id || null, media_message_ids: media.map((item) => item.message_id).filter(Boolean), title_label_message_id: steps.title_label?.message_id || null, title_content_message_id: steps.title_content?.message_id || null, caption_label_message_id: steps.caption_label?.message_id || null, caption_content_message_id: steps.caption_content?.message_id || null, title_message_id: steps.title_content?.message_id || null, caption_message_id: steps.caption_content?.message_id || null, lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), updated_at: new Date().toISOString(), ...extra }).eq("id", job.id);
    };
    const step = async (key, action) => {
      if (steps[key]?.status === "sent") return;
      try { const id = await action(); steps[key] = { status: "sent", ...(id ? { message_id: id } : {}) }; sent += 1; }
      catch (error) { steps[key] = { status: "failed", error: safeError(error) }; failed += 1; }
      await persist(); await sleep(700);
    };
    try {
      const [{ data: existingNews }, { data: recipient }] = await Promise.all([job.news_id ? db.from("news_items").select("id,source_url,original_title,original_caption,clean_original_caption,source_caption,temporary_media_path,temporary_media_paths").eq("id", job.news_id).single() : Promise.resolve({ data: null }), db.from("distribution_recipients").select("*").eq("id", job.recipient_id).single()]);
      const direct = job.source_type === "direct_url" ? (job.direct_payload || {}) : null;
      const news = existingNews || (direct ? { source_url: job.source_url, original_title: direct.original_title, original_caption: direct.original_caption, clean_original_caption: null, source_caption: null, temporary_media_path: null, temporary_media_paths: [] } : null);
      if (!news || !recipient?.is_active) throw new Error("Notícia ou destinatário indisponível");
      const phone = normalizePhone(recipient.phone); const testMode = String(process.env.DISTRIBUTION_TEST_MODE || "true").toLowerCase() !== "false"; const testPhone = normalizePhone(process.env.DISTRIBUTION_TEST_PHONE || "5582998264805"); if (testMode && phone !== testPhone) throw new Error("Durante os testes, somente Ismael pode receber mensagens");
      await step("link", () => evolution.text(phone, `🔗 *Publicação para ser feita:*\n${news.source_url}`));
      if (!steps.media?.length || steps.media.some((item) => item.status !== "sent")) {
        const paths = news.temporary_media_paths?.length ? news.temporary_media_paths : [news.temporary_media_path].filter(Boolean); const files = [];
        let mediaError = null;
        try {
          if (paths.length) {
            for (const [index, storagePath] of paths.entries()) { const { data, error } = await db.storage.from("temporary-media").download(storagePath); if (error || !data) throw new Error("Mídia temporária indisponível"); const input = join(dir, `source-${index}${extname(storagePath) || ".bin"}`); const bytes = Buffer.from(await data.arrayBuffer()); await fs.writeFile(input, bytes); files.push({ input, bytes, contentType: data.type || "", filename: storagePath.split("/").pop() || `arquivo-${index + 1}` }); }
          } else {
            for (const [index, source] of (await cobaltSources(news.source_url)).entries()) { const input = join(dir, `source-${index}${extname(source.filename) || ".bin"}`); const downloaded = await fetchToFile(source.url, input); files.push({ input, ...downloaded, filename: source.filename }); }
          }
        } catch (error) { mediaError = error; }
        const mediaSteps = [];
        if (mediaError) {
          try { const id = await evolution.text(phone, "⚠️ Não foi possível te enviar a mídia, só o link."); mediaSteps.push({ status: "sent", message_id: id, media_unavailable: true }); sent += 1; }
          catch (error) { mediaSteps.push({ status: "failed", error: safeError(error), media_unavailable: true }); failed += 1; }
          steps.media = mediaSteps; await persist(); await sleep(700);
        }
        for (const [index, file] of files.entries()) {
          try {
            const header = imageMime(file.bytes); let path = file.input; let mime; let filename;
            if (header) { mime = header.mime; filename = `copynews-noticia-${index + 1}${header.extension}`; }
            else { const output = join(dir, `copynews-noticia-${index + 1}.mp4`); const validation = await compatibleVideo(file.input, output); path = output; mime = "video/mp4"; filename = `copynews-noticia-${index + 1}.mp4`; log("distribution.media.validated", { jobId: job.id, container: validation.container, videoCodec: validation.videoCodec, audioCodec: validation.audioCodec, converted: validation.converted, bytes: validation.size }); }
            const id = await evolution.document(phone, path, mime, safeFilename(filename, `copynews-arquivo-${index + 1}`)); mediaSteps.push({ status: "sent", message_id: id, mime_type: mime, filename }); sent += 1;
          } catch (error) { mediaSteps.push({ status: "failed", error: safeError(error) }); failed += 1; }
          steps.media = mediaSteps; await persist(); await sleep(700);
        }
      }
      await step("title_label", () => evolution.text(phone, "📰 *Título Original*"));
      await step("title_content", () => evolution.text(phone, String(news.original_title || "").trim() || (direct?.title_state === "failed" ? "Não foi possível identificar o título." : "Não há título na imagem.")));
      await step("caption_label", () => evolution.text(phone, "📝 *Legenda Original*"));
      await step("caption_content", () => evolution.text(phone, String(news.original_caption || news.clean_original_caption || news.source_caption || "").trim() || (direct?.caption_state === "failed" ? "Não foi possível obter a legenda da publicação." : "Não há legenda.")));
      const all = [steps.link, ...(steps.media || []), steps.title_label, steps.title_content, steps.caption_label, steps.caption_content]; const status = all.every((item) => item?.status === "sent") ? "success" : all.some((item) => item?.status === "sent") ? "partial" : "failed"; const errors = all.filter((item) => item?.status === "failed").map((item) => item.error).filter(Boolean).join("; ").slice(0, 500) || null;
      await persist({ status, sent_at: new Date().toISOString(), error_message: errors, lease_owner: null, lease_expires_at: null }); log("distribution.completed", { jobId: job.id, status, sent, failed });
    } catch (error) {
      const retry = job.attempts < 3; await persist({ status: retry ? "queued" : "failed", error_message: safeError(error), lease_owner: null, lease_expires_at: null, ...(retry ? {} : { sent_at: new Date().toISOString() }) }); log("distribution.failed", { jobId: job.id, retry, message: safeError(error) });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
  return { configured, claim, process: processJob, claimPreview, processPreview };
}

export { imageMime, isCompatibleVideo, probeVideo };
