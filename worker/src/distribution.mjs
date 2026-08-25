import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { spawn } from "node:child_process";
import { extractMetadata } from "./adapters.mjs";
import { normalizeHeadlineCase, readFrames } from "./openrouter.mjs";
import { readFramesLocally } from "./local-ocr.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeError = (error) =>
  String(error?.message || error || "Falha inesperada")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]")
    .slice(0, 400);
const normalizePhone = (value) => {
  const phone = String(value || "").replace(/\D/g, "");
  if (!/^55[1-9][0-9]{9,10}$/.test(phone)) throw new Error("Telefone inválido");
  return phone;
};
const messageId = (payload) =>
  String(
    payload?.key?.id ||
      payload?.data?.key?.id ||
      payload?.messageId ||
      payload?.id ||
      "",
  ) || null;
const safeFilename = (value, fallback) =>
  (
    String(value || fallback)
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback
  ).slice(0, 100);
const expectsVideo = (value) =>
  /instagram\.com\/(?:reel|reels|tv)\//i.test(String(value || ""));

async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data));
    child.stderr.on("data", (data) => (stderr += data));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(`${command} saiu com ${code}: ${stderr.slice(-500)}`),
          ),
    );
  });
}
async function execute(command, args) {
  await capture(command, args);
}

async function probeVideo(path) {
  const payload = JSON.parse(
    await capture("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=format_name,duration,size:stream=index,codec_type,codec_name",
      "-of",
      "json",
      path,
    ]),
  );
  const video = payload.streams?.find(
    (stream) => stream.codec_type === "video",
  );
  const audio = payload.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  if (
    !video ||
    !Number(payload.format?.duration) ||
    !Number(payload.format?.size)
  )
    throw new Error("Vídeo inválido ou incompleto");
  return {
    container: payload.format.format_name,
    videoCodec: video.codec_name,
    audioCodec: audio?.codec_name || null,
    duration: Number(payload.format.duration),
    size: Number(payload.format.size),
  };
}
function isCompatibleVideo(probe) {
  return (
    String(probe.container)
      .split(",")
      .some((name) =>
        ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(name),
      ) &&
    probe.videoCodec === "h264" &&
    (!probe.audioCodec || probe.audioCodec === "aac")
  );
}
async function compatibleVideo(input, output) {
  const original = await probeVideo(input);
  if (isCompatibleVideo(original)) {
    await fs.copyFile(input, output);
    return { ...original, converted: false };
  }
  await execute("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    output,
  ]);
  const converted = await probeVideo(output);
  if (!isCompatibleVideo(converted))
    throw new Error("Conversão não produziu MP4 H.264/AAC válido");
  return { ...converted, converted: true };
}
function imageMime(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return { mime: "image/jpeg", extension: ".jpg" };
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return { mime: "image/png", extension: ".png" };
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return { mime: "image/webp", extension: ".webp" };
  return null;
}
async function fetchToFile(url, path, extraHeaders = {}) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 100 * 1024 * 1024)
    throw new Error("Arquivo vazio ou acima de 100 MB");
  await fs.writeFile(path, bytes);
  return {
    bytes,
    contentType: (response.headers.get("content-type") || "")
      .split(";")[0]
      .toLowerCase(),
  };
}
async function downloadVideoWithYtDlp(
  sourceUrl,
  dir,
  basename = "instagram-reel",
) {
  const output = join(dir, `${basename}.mp4`);
  const template = join(dir, `${basename}.%(ext)s`);
  await execute("yt-dlp", [
    "--no-playlist",
    "--no-part",
    "--no-write-thumbnail",
    "--force-overwrites",
    "--max-filesize",
    "200M",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
    "--format",
    "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][acodec^=mp4a]/best[ext=mp4]/best",
    "--remux-video",
    "mp4",
    "--output",
    template,
    sourceUrl,
  ]);
  const stats = await fs.stat(output);
  if (!stats.size || stats.size > 200 * 1024 * 1024)
    throw new Error("Vídeo recuperado inválido ou acima de 200 MB");
  return {
    input: output,
    bytes: await fs.readFile(output),
    contentType: "video/mp4",
    filename: `${basename}.mp4`,
  };
}
async function cobaltSources(sourceUrl) {
  const endpoint = `${process.env.COBALT_API_URL.replace(/\/+$/, "")}/`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(process.env.COBALT_API_KEY
        ? { Authorization: `Api-Key ${process.env.COBALT_API_KEY}` }
        : {}),
    },
    body: JSON.stringify({
      url: sourceUrl,
      downloadMode: "auto",
      videoQuality: "1080",
      filenameStyle: "basic",
      alwaysProxy: true,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === "error")
    throw new Error("Não foi possível obter a mídia original");
  if (payload.status === "picker")
    return (payload.picker || [])
      .filter((item) => item.url)
      .map((item, index) => ({
        url: item.url,
        filename: item.filename || `arquivo-${index + 1}`,
      }));
  if (["redirect", "tunnel"].includes(payload.status) && payload.url) {
    let url = payload.url;
    if (payload.status === "tunnel") {
      const tunnel = new URL(url);
      const base = new URL(process.env.COBALT_API_URL);
      tunnel.protocol = base.protocol;
      tunnel.host = base.host;
      url = tunnel.toString();
    }
    return [{ url, filename: payload.filename || "arquivo" }];
  }
  throw new Error("A origem não retornou mídia compatível");
}

class EvolutionService {
  constructor(log) {
    this.log = log;
    this.base = process.env.DISTRIBUTION_EVOLUTION_URL.replace(/\/$/, "");
    this.instance = process.env.DISTRIBUTION_EVOLUTION_INSTANCE;
    this.apiKey = process.env.DISTRIBUTION_EVOLUTION_API_KEY;
  }
  async post(path, body) {
    let last = "Evolution indisponível";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${this.base}${path}/${this.instance}`, {
          method: "POST",
          headers: { apikey: this.apiKey, "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        });
        const payload = await response.json().catch(() => ({}));
        this.log(
          response.ok
            ? "distribution.message.sent"
            : "distribution.message.failed",
          { responseStatus: response.status, attempt },
        );
        if (response.ok) return messageId(payload);
        last = `Evolution HTTP ${response.status}`;
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        last = safeError(error);
      }
      if (attempt < 3) await sleep(attempt * 700);
    }
    throw new Error(last);
  }
  text(phone, text) {
    return this.post("/message/sendText", { number: phone, text });
  }
  document(phone, path, mime, filename) {
    return fs
      .readFile(path)
      .then((bytes) =>
        this.post("/message/sendMedia", {
          number: phone,
          mediatype: "document",
          mimetype: mime,
          media: bytes.toString("base64"),
          fileName: filename,
        }),
      );
  }
}

export function createDistributionProcessor({ db, workerId, log }) {
  const required = [
    "DISTRIBUTION_EVOLUTION_URL",
    "DISTRIBUTION_EVOLUTION_INSTANCE",
    "DISTRIBUTION_EVOLUTION_API_KEY",
  ];
  const configured = required.every((key) => process.env[key]);
  const errorCode=(error)=>{const message=safeError(error).toLowerCase();if(/private|privad|login|required|forbidden/.test(message))return "private_media";if(/timeout|timed out/.test(message))return "timeout";if(/download|cobalt|media|mídia/.test(message))return "download_failed";if(/ocr|title|título/.test(message))return "ocr_failed";if(/cancel/.test(message))return "cancelled";return "internal_error";};

  async function claim() {
    if (!configured) return null;
    const expired = new Date().toISOString();
    const { data: rows, error } = await db
      .from("news_send_history")
      .select("*")
      .in("status", ["queued", "processing"])
      .is("cancel_requested_at", null)
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${expired}`)
      .order("queued_at")
      .limit(1);
    if (error) throw error;
    const job = rows?.[0];
    if (!job) return null;
    const { data, error: claimError } = await db
      .from("news_send_history")
      .update({
        status: "processing",
        processing_started_at:
          job.processing_started_at || new Date().toISOString(),
        attempts: job.attempts + 1,
        lease_owner: workerId,
        lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", job.status)
      .eq("attempts", job.attempts)
      .select()
      .maybeSingle();
    return claimError || !data ? null : data;
  }

  async function claimPreview() {
    const expired = new Date().toISOString();
    const { data: rows, error } = await db
      .from("distribution_direct_previews")
      .select("*")
      .in("status", ["queued", "processing"])
      .or(`lease_expires_at.is.null,lease_expires_at.lt.${expired}`)
      .order("created_at")
      .limit(1);
    if (error) throw error;
    const preview = rows?.[0];
    if (!preview) return null;
    const { data } = await db
      .from("distribution_direct_previews")
      .update({
        status: "processing",
        stage: "metadata",
        progress: 8,
        stage_started_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        attempts: preview.attempts + 1,
        lease_owner: workerId,
        lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", preview.id)
      .eq("status", preview.status)
      .eq("attempts", preview.attempts)
      .select()
      .maybeSingle();
    return data;
  }

  async function raiseOperationalAlert(preview, alertType, title, details = {}, severity = "warning") {
    const dedupeKey = `${alertType}:${preview.normalized_url || "queue"}`.slice(0, 240);
    const { error } = await db.from("distribution_operational_alerts").insert({
      organization_id: preview.organization_id,
      alert_type: alertType,
      severity,
      title,
      details,
      dedupe_key: dedupeKey,
    });
    if (error?.code === "23505") {
      const { data: current } = await db
        .from("distribution_operational_alerts")
        .select("id,occurrences")
        .eq("organization_id", preview.organization_id)
        .eq("dedupe_key", dedupeKey)
        .eq("status", "open")
        .maybeSingle();
      if (current)
        await db.from("distribution_operational_alerts").update({
          occurrences: current.occurrences + 1,
          last_seen_at: new Date().toISOString(),
          details,
        }).eq("id", current.id);
    } else if (error) log("distribution.alert.failed", { alertType, message: safeError(error) });
  }

  async function monitorPreviews() {
    const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: stalled } = await db
      .from("distribution_direct_previews")
      .select("id,organization_id,normalized_url,status,stage,heartbeat_at,created_at")
      .in("status", ["queued", "processing"])
      .or(`heartbeat_at.lt.${cutoff},and(heartbeat_at.is.null,created_at.lt.${cutoff})`)
      .limit(10);
    for (const preview of stalled || [])
      await raiseOperationalAlert(
        preview,
        "stalled_queue",
        "Processamento de publicação aparentemente parado",
        { preview_id: preview.id, stage: preview.stage, status: preview.status },
        "critical",
      );
  }

  async function processPreview(preview) {
    const dir = join(tmpdir(), `copy-news-preview-${preview.id}`);
    const framesDir = join(dir, "frames");
    await fs.mkdir(framesDir, { recursive: true });
    let metadata = null;
    const startedAt = Date.now();
    let stageStartedAt = startedAt;
    let currentStage = "metadata";
    const timings = { ...(preview.timings || {}) };
    const transition = async (stage, progress) => {
      const {data:state}=await db.from("distribution_direct_previews").select("cancel_requested_at").eq("id",preview.id).single();
      if(state?.cancel_requested_at)throw new Error("Processamento cancelado pelo usuário");
      const now = Date.now();
      timings[currentStage] = Math.max(0, now - stageStartedAt);
      currentStage = stage;
      stageStartedAt = now;
      await db.from("distribution_direct_previews").update({
        stage,
        progress,
        stage_started_at: new Date(now).toISOString(),
        heartbeat_at: new Date(now).toISOString(),
        timings,
        updated_at: new Date(now).toISOString(),
      }).eq("id", preview.id);
    };
    try {
      metadata = await extractMetadata(preview.source_url);
      await transition("download", 22);
      let sources;
      try {
        sources = await cobaltSources(preview.source_url);
      } catch (error) {
        sources = (metadata?.mediaItems || []).filter(
          (item) => item.url && item.auditOnly !== true,
        );
        if (!sources.length) throw error;
        log("distribution.preview.metadata_media_fallback", {
          previewId: preview.id,
          mediaCount: sources.length,
        });
      }
      const files = [];
      for (const [index, source] of sources.entries()) {
        const input = join(
          dir,
          `source-${index}${extname(source.filename) || ".bin"}`,
        );
        const downloaded = await fetchToFile(source.url, input, source.headers);
        files.push({ input, ...downloaded });
      }
      if (
        expectsVideo(preview.source_url) &&
        files.length === 1 &&
        imageMime(files[0].bytes)
      ) {
        const recovered = await downloadVideoWithYtDlp(
          preview.source_url,
          dir,
          "preview-reel",
        );
        files.splice(0, files.length, recovered);
      }
      let mediaKind = files.length > 1 ? "carousel" : "video";
      await transition("frames", 52);
      for (const [index, file] of files.entries()) {
        const image = imageMime(file.bytes);
        if (files.length === 1 && image) mediaKind = "image";
        const output = join(framesDir, `frame-${index}-%02d.jpg`);
        await execute(
          "ffmpeg",
          image
            ? [
                "-y",
                "-v",
                "error",
                "-i",
                file.input,
                "-vf",
                "scale=960:-1",
                "-frames:v",
                "1",
                "-q:v",
                "4",
                output,
              ]
            : [
                "-y",
                "-v",
                "error",
                "-i",
                file.input,
                "-vf",
                "fps=1/3,scale=960:-1",
                "-frames:v",
                "4",
                "-q:v",
                "4",
                output,
              ],
        );
      }
      if (expectsVideo(preview.source_url) && mediaKind === "image")
        throw new Error("A origem retornou apenas a capa do Reel, sem o vídeo");
      const framePaths = (await fs.readdir(framesDir))
        .sort()
        .slice(0, 8)
        .map((name) => join(framesDir, name));
      let ocr = null;
      let titleState = "absent";
      await transition("ocr", 72);
      try {
        ocr = await readFramesLocally(framePaths, {
          requirePersistence: mediaKind === "video",
        });
        if (!ocr && framePaths.length && process.env.OPENROUTER_API_KEY) {
          const frames = await Promise.all(
            framePaths.map(async (path) =>
              (await fs.readFile(path)).toString("base64"),
            ),
          );
          ocr = await readFrames(
            frames,
            process.env.OPENROUTER_API_KEY,
            process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4.1-mini",
          );
        }
        titleState = ocr?.title ? "found" : "absent";
      } catch {
        titleState = "failed";
      }
      const metadataTitle = String(metadata?.title || "").trim();
      const visualTitle = String(ocr?.title || metadataTitle).trim();
      const caption = String(metadata?.caption || "").trim();
      const captionState = caption
        ? "found"
        : metadata?.provider === "none"
          ? "failed"
          : "absent";
      await transition("finalizing", 94);
      const ocrConfidence = Number.isFinite(Number(ocr?.confidence))
        ? Math.max(0, Math.min(1, Number(ocr.confidence)))
        : null;
      const confidenceLevel = visualTitle
        ? ocrConfidence === null
          ? "medium"
          : ocrConfidence >= 0.82
            ? "high"
            : ocrConfidence >= 0.65
              ? "medium"
              : "low"
        : "unavailable";
      timings[currentStage] = Date.now() - stageStartedAt;
      timings.total = Date.now() - startedAt;
      await db
        .from("distribution_direct_previews")
        .update({
          status: "ready",
          stage: "ready",
          progress: 100,
          media_kind: mediaKind,
          media_count: files.length,
          original_title: visualTitle
            ? normalizeHeadlineCase(visualTitle, caption)
            : null,
          original_caption: caption || null,
          title_state: visualTitle ? "found" : titleState,
          caption_state: captionState,
          ocr_confidence: ocrConfidence,
          confidence_level: confidenceLevel,
          timings,
          heartbeat_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          error_message: null,
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", preview.id);
      log("distribution.preview.ready", {
        previewId: preview.id,
        mediaKind,
        mediaCount: files.length,
        titleState,
        captionState,
        confidenceLevel,
        durationMs: timings.total,
      });
      if (timings.total >= 120_000)
        await raiseOperationalAlert(preview, "slow_processing", "Processamento de publicação acima de 2 minutos", { preview_id: preview.id, duration_ms: timings.total, timings });
    } catch (error) {
      const caption = String(metadata?.caption || "").trim();
      const code = errorCode(error);
      const cancelled = code === "cancelled";
      timings[currentStage] = Date.now() - stageStartedAt;
      timings.total = Date.now() - startedAt;
      const { error: updateError } = await db
        .from("distribution_direct_previews")
        .update({
          status: cancelled ? "failed" : "ready",
          stage: cancelled ? "failed" : "ready",
          progress: 100,
          media_kind: null,
          media_count: 0,
          original_title: null,
          original_caption: caption || null,
          title_state: "failed",
          confidence_level: "unavailable",
          caption_state: caption
            ? "found"
            : metadata?.provider === "none"
              ? "failed"
              : "absent",
          error_message: safeError(error),
          error_code: code,
          timings,
          heartbeat_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          lease_owner: null,
          lease_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", preview.id);
      if (updateError) throw updateError;
      log(cancelled ? "distribution.preview.cancelled" : "distribution.preview.ready_without_media", {
        previewId: preview.id,
        message: safeError(error),
      });
      const { count } = await db.from("distribution_direct_previews")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", preview.organization_id)
        .eq("media_count", 0)
        .eq("title_state", "failed")
        .gte("created_at", new Date(Date.now() - 15 * 60_000).toISOString());
      if ((count || 0) >= 3)
        await raiseOperationalAlert(preview, "download_failures", "Falhas repetidas ao obter mídias", { failures_last_15_minutes: count }, "critical");
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async function processBatchDeliveryJob(
    job,
    recipient,
    direct,
    evolution,
    persist,
    steps,
    dir,
  ) {
    const items = Array.isArray(direct?.items) ? direct.items : [];
    if (items.length < 2 || !recipient?.is_active || !job.share_slug)
      throw new Error("Lote ou destinatário indisponível");
    const phone = normalizePhone(recipient.phone);
    const testMode =
      String(process.env.DISTRIBUTION_TEST_MODE || "true").toLowerCase() !==
      "false";
    const testPhone = normalizePhone(
      process.env.DISTRIBUTION_TEST_PHONE || "5582998264805",
    );
    if (testMode && phone !== testPhone)
      throw new Error(
        "Durante os testes, somente Ismael pode receber mensagens",
      );
    const deliveryPaths = [];
    const processedItems = [];
    const warnings = [];
    for (const [itemIndex, item] of items.entries()) {
      const itemDir = join(dir, `item-${itemIndex + 1}`);
      await fs.mkdir(itemDir, { recursive: true });
      const files = [];
      let mediaWarning = null;
      try {
        for (const [index, source] of (
          await cobaltSources(item.source_url)
        ).entries()) {
          const input = join(
            itemDir,
            `source-${index}${extname(source.filename) || ".bin"}`,
          );
          const downloaded = await fetchToFile(source.url, input);
          files.push({ input, ...downloaded, filename: source.filename });
        }
        if (
          expectsVideo(item.source_url) &&
          files.length === 1 &&
          imageMime(files[0].bytes)
        ) {
          const recovered = await downloadVideoWithYtDlp(
            item.source_url,
            itemDir,
            `delivery-reel-${itemIndex + 1}`,
          );
          files.splice(0, files.length, recovered);
        }
      } catch (error) {
        mediaWarning = safeError(error);
        warnings.push(`Notícia ${itemIndex + 1}: ${mediaWarning}`);
        files.length = 0;
      }
      const itemPaths = [];
      for (const [index, file] of files.entries()) {
        const header = imageMime(file.bytes);
        const suffix = files.length === 1 ? "" : `-${index + 1}`;
        const baseName = `noticia-${itemIndex + 1}-original-baixada${suffix}`;
        let path = file.input;
        let mime;
        let filename;
        if (header) {
          mime = header.mime;
          filename = `${baseName}${header.extension}`;
        } else {
          const output = join(itemDir, `${baseName}.mp4`);
          await compatibleVideo(file.input, output);
          path = output;
          mime = "video/mp4";
          filename = `${baseName}.mp4`;
        }
        const storagePath = `distribution/${job.id}/item-${itemIndex + 1}/${filename}`;
        const bytes = await fs.readFile(path);
        const { error } = await db.storage
          .from("temporary-media")
          .upload(storagePath, bytes, { contentType: mime, upsert: true });
        if (error) throw error;
        itemPaths.push(storagePath);
        deliveryPaths.push(storagePath);
      }
      processedItems.push({
        ...item,
        position: itemIndex + 1,
        delivery_media_paths: itemPaths,
        media_error: mediaWarning,
      });
      await persist({
        direct_payload: {
          ...direct,
          items: processedItems.concat(items.slice(itemIndex + 1)),
        },
        delivery_media_paths: deliveryPaths,
        delivery_media_expires_at: new Date(
          Date.now() + 7 * 86400000,
        ).toISOString(),
      });
    }
    await persist({
      direct_payload: { ...direct, items: processedItems },
      delivery_media_paths: deliveryPaths,
      delivery_media_expires_at: new Date(
        Date.now() + 7 * 86400000,
      ).toISOString(),
      error_message: warnings.length ? warnings.join(" | ") : null,
    });
    const publicBase = String(
      process.env.PUBLIC_APP_URL || "https://copynews.netlify.app",
    ).replace(/\/$/, "");
    const messageIdValue = await evolution.text(
      phone,
      `📰 *${items.length} conteúdos para serem publicados*\n\n${publicBase}/envio/${job.share_slug}`,
    );
    steps.delivery_link = {
      status: "sent",
      ...(messageIdValue ? { message_id: messageIdValue } : {}),
    };
    await persist({
      status: warnings.length ? "partial" : "success",
      link_message_id: messageIdValue,
      sent_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    });
    log("distribution.batch.completed", {
      jobId: job.id,
      itemCount: items.length,
      mediaCount: deliveryPaths.length,
      warningCount: warnings.length,
    });
  }

  async function processDeliveryJob(job) {
    const dir = join(tmpdir(), `copy-news-delivery-${job.id}`);
    await fs.mkdir(dir, { recursive: true });
    const steps = {
      delivery_link: { status: "pending" },
      ...(job.steps || {}),
    };
    const evolution = new EvolutionService(log);
    const persist = async (extra = {}) => {
      const { error } = await db
        .from("news_send_history")
        .update({
          steps,
          lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
          ...extra,
        })
        .eq("id", job.id);
      if (error) throw error;
    };
    try {
      const [{ data: existingNews }, { data: recipient }] = await Promise.all([
        job.news_id
          ? db
              .from("news_items")
              .select(
                "id,source_url,original_title,original_caption,clean_original_caption,source_caption,temporary_media_path,temporary_media_paths",
              )
              .eq("id", job.news_id)
              .single()
          : Promise.resolve({ data: null }),
        db
          .from("distribution_recipients")
          .select("*")
          .eq("id", job.recipient_id)
          .single(),
      ]);
      const direct = ["direct_url", "direct_batch"].includes(job.source_type)
        ? job.direct_payload || {}
        : null;
      const news =
        existingNews ||
        (job.source_type === "direct_url"
          ? {
              source_url: job.source_url,
              original_title: direct.original_title,
              original_caption: direct.original_caption,
              clean_original_caption: null,
              source_caption: null,
              temporary_media_path: null,
              temporary_media_paths: [],
            }
          : null);
      if (job.source_type === "direct_batch")
        return processBatchDeliveryJob(
          job,
          recipient,
          direct,
          evolution,
          persist,
          steps,
          dir,
        );
      if (!news || !recipient?.is_active || !job.share_slug)
        throw new Error("Entrega ou destinatário indisponível");
      const phone = normalizePhone(recipient.phone);
      const testMode =
        String(process.env.DISTRIBUTION_TEST_MODE || "true").toLowerCase() !==
        "false";
      const testPhone = normalizePhone(
        process.env.DISTRIBUTION_TEST_PHONE || "5582998264805",
      );
      if (testMode && phone !== testPhone)
        throw new Error(
          "Durante os testes, somente Ismael pode receber mensagens",
        );
      const paths = news.temporary_media_paths?.length
        ? news.temporary_media_paths
        : [news.temporary_media_path].filter(Boolean);
      const files = [];
      let mediaWarning = null;
      try {
        if (paths.length) {
          for (const [index, storagePath] of paths.entries()) {
            const { data, error } = await db.storage
              .from("temporary-media")
              .download(storagePath);
            if (error || !data)
              throw new Error("Mídia temporária indisponível");
            const input = join(
              dir,
              `source-${index}${extname(storagePath) || ".bin"}`,
            );
            const bytes = Buffer.from(await data.arrayBuffer());
            await fs.writeFile(input, bytes);
            files.push({
              input,
              bytes,
              filename: storagePath.split("/").pop() || `arquivo-${index + 1}`,
            });
          }
        } else {
          for (const [index, source] of (
            await cobaltSources(news.source_url)
          ).entries()) {
            const input = join(
              dir,
              `source-${index}${extname(source.filename) || ".bin"}`,
            );
            const downloaded = await fetchToFile(source.url, input);
            files.push({ input, ...downloaded, filename: source.filename });
          }
        }
        if (
          expectsVideo(news.source_url) &&
          files.length === 1 &&
          imageMime(files[0].bytes)
        ) {
          const recovered = await downloadVideoWithYtDlp(
            news.source_url,
            dir,
            "delivery-reel",
          );
          files.splice(0, files.length, recovered);
        }
      } catch (error) {
        mediaWarning = safeError(error);
        files.length = 0;
      }
      const deliveryPaths = [];
      for (const [index, file] of files.entries()) {
        const header = imageMime(file.bytes);
        const baseName =
          files.length === 1
            ? "noticia-original-baixada"
            : `noticia-original-baixada-${index + 1}`;
        let path = file.input;
        let mime;
        let filename;
        if (header) {
          mime = header.mime;
          filename = `${baseName}${header.extension}`;
        } else {
          const output = join(dir, `${baseName}.mp4`);
          await compatibleVideo(file.input, output);
          path = output;
          mime = "video/mp4";
          filename = `${baseName}.mp4`;
        }
        const storagePath = `distribution/${job.id}/${filename}`;
        const bytes = await fs.readFile(path);
        const { error } = await db.storage
          .from("temporary-media")
          .upload(storagePath, bytes, { contentType: mime, upsert: true });
        if (error) throw error;
        deliveryPaths.push(storagePath);
      }
      await persist({
        delivery_media_paths: deliveryPaths,
        delivery_media_expires_at: new Date(
          Date.now() + 7 * 86400000,
        ).toISOString(),
        error_message: mediaWarning,
      });
      const publicBase = String(
        process.env.PUBLIC_APP_URL || "https://copynews.netlify.app",
      ).replace(/\/$/, "");
      const messageIdValue = await evolution.text(
        phone,
        `📰 *Conteúdo para ser publicado*\n\n${publicBase}/envio/${job.share_slug}`,
      );
      steps.delivery_link = {
        status: "sent",
        ...(messageIdValue ? { message_id: messageIdValue } : {}),
      };
      await persist({
        status: "success",
        link_message_id: messageIdValue,
        sent_at: new Date().toISOString(),
        lease_owner: null,
        lease_expires_at: null,
      });
      log("distribution.delivery.completed", {
        jobId: job.id,
        mediaCount: deliveryPaths.length,
      });
    } catch (error) {
      steps.delivery_link = { status: "failed", error: safeError(error) };
      const retry = job.attempts < 3;
      await persist({
        status: retry ? "queued" : "failed",
        error_message: safeError(error),
        lease_owner: null,
        lease_expires_at: null,
        ...(retry ? {} : { sent_at: new Date().toISOString() }),
      });
      log("distribution.delivery.failed", {
        jobId: job.id,
        retry,
        message: safeError(error),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async function processJob(job) {
    if (job.share_slug) return processDeliveryJob(job);
    const dir = join(tmpdir(), `copy-news-distribution-${job.id}`);
    await fs.mkdir(dir, { recursive: true });
    const steps = {
      link: { status: "pending" },
      media: [],
      title_label: { status: "pending" },
      title_content: { status: "pending" },
      caption_label: { status: "pending" },
      caption_content: { status: "pending" },
      combined_content: { status: "pending" },
      ...(job.steps || {}),
    };
    const evolution = new EvolutionService(log);
    let sent = 0;
    let failed = 0;
    const persist = async (extra = {}) => {
      const media = steps.media || [];
      await db
        .from("news_send_history")
        .update({
          steps,
          link_message_id: steps.link?.message_id || null,
          media_message_ids: media
            .map((item) => item.message_id)
            .filter(Boolean),
          title_label_message_id: steps.title_label?.message_id || null,
          title_content_message_id: steps.title_content?.message_id || null,
          caption_label_message_id: steps.caption_label?.message_id || null,
          caption_content_message_id: steps.caption_content?.message_id || null,
          title_message_id: steps.title_content?.message_id || null,
          caption_message_id: steps.caption_content?.message_id || null,
          lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
          ...extra,
        })
        .eq("id", job.id);
    };
    const step = async (key, action) => {
      if (steps[key]?.status === "sent") return;
      try {
        const id = await action();
        steps[key] = { status: "sent", ...(id ? { message_id: id } : {}) };
        sent += 1;
      } catch (error) {
        steps[key] = { status: "failed", error: safeError(error) };
        failed += 1;
      }
      await persist();
      await sleep(700);
    };
    try {
      const [{ data: existingNews }, { data: recipient }] = await Promise.all([
        job.news_id
          ? db
              .from("news_items")
              .select(
                "id,source_url,original_title,original_caption,clean_original_caption,source_caption,temporary_media_path,temporary_media_paths",
              )
              .eq("id", job.news_id)
              .single()
          : Promise.resolve({ data: null }),
        db
          .from("distribution_recipients")
          .select("*")
          .eq("id", job.recipient_id)
          .single(),
      ]);
      const direct =
        job.source_type === "direct_url" ? job.direct_payload || {} : null;
      const news =
        existingNews ||
        (direct
          ? {
              source_url: job.source_url,
              original_title: direct.original_title,
              original_caption: direct.original_caption,
              clean_original_caption: null,
              source_caption: null,
              temporary_media_path: null,
              temporary_media_paths: [],
            }
          : null);
      if (!news || !recipient?.is_active)
        throw new Error("Notícia ou destinatário indisponível");
      const phone = normalizePhone(recipient.phone);
      const testMode =
        String(process.env.DISTRIBUTION_TEST_MODE || "true").toLowerCase() !==
        "false";
      const testPhone = normalizePhone(
        process.env.DISTRIBUTION_TEST_PHONE || "5582998264805",
      );
      if (testMode && phone !== testPhone)
        throw new Error(
          "Durante os testes, somente Ismael pode receber mensagens",
        );
      await step("link", () =>
        evolution.text(
          phone,
          `🔗 *Publicação para ser feita:*\n${news.source_url}`,
        ),
      );
      if (
        !steps.media?.length ||
        steps.media.some((item) => item.status !== "sent")
      ) {
        const paths = news.temporary_media_paths?.length
          ? news.temporary_media_paths
          : [news.temporary_media_path].filter(Boolean);
        const files = [];
        let mediaError = null;
        try {
          if (paths.length) {
            for (const [index, storagePath] of paths.entries()) {
              const { data, error } = await db.storage
                .from("temporary-media")
                .download(storagePath);
              if (error || !data)
                throw new Error("Mídia temporária indisponível");
              const input = join(
                dir,
                `source-${index}${extname(storagePath) || ".bin"}`,
              );
              const bytes = Buffer.from(await data.arrayBuffer());
              await fs.writeFile(input, bytes);
              files.push({
                input,
                bytes,
                contentType: data.type || "",
                filename:
                  storagePath.split("/").pop() || `arquivo-${index + 1}`,
              });
            }
          } else {
            for (const [index, source] of (
              await cobaltSources(news.source_url)
            ).entries()) {
              const input = join(
                dir,
                `source-${index}${extname(source.filename) || ".bin"}`,
              );
              const downloaded = await fetchToFile(source.url, input);
              files.push({ input, ...downloaded, filename: source.filename });
            }
          }
        } catch (error) {
          mediaError = error;
        }
        const mediaSteps = [];
        if (
          !mediaError &&
          expectsVideo(news.source_url) &&
          files.length === 1 &&
          imageMime(files[0].bytes)
        ) {
          try {
            const recovered = await downloadVideoWithYtDlp(
              news.source_url,
              dir,
              "distribution-reel",
            );
            files.splice(0, files.length, recovered);
          } catch (error) {
            mediaError = error;
            files.length = 0;
          }
        }
        if (mediaError) {
          try {
            const id = await evolution.text(
              phone,
              "⚠️ Não foi possível te enviar a mídia, só o link.",
            );
            mediaSteps.push({
              status: "sent",
              message_id: id,
              media_unavailable: true,
            });
            sent += 1;
          } catch (error) {
            mediaSteps.push({
              status: "failed",
              error: safeError(error),
              media_unavailable: true,
            });
            failed += 1;
          }
          steps.media = mediaSteps;
          await persist();
          await sleep(700);
        }
        for (const [index, file] of files.entries()) {
          try {
            const header = imageMime(file.bytes);
            let path = file.input;
            let mime;
            let filename;
            const baseName =
              files.length === 1
                ? "noticia-original-baixada"
                : `noticia-original-baixada-${index + 1}`;
            if (header) {
              mime = header.mime;
              filename = `${baseName}${header.extension}`;
            } else {
              const output = join(dir, `${baseName}.mp4`);
              const validation = await compatibleVideo(file.input, output);
              path = output;
              mime = "video/mp4";
              filename = `${baseName}.mp4`;
              log("distribution.media.validated", {
                jobId: job.id,
                container: validation.container,
                videoCodec: validation.videoCodec,
                audioCodec: validation.audioCodec,
                converted: validation.converted,
                bytes: validation.size,
              });
            }
            const id = await evolution.document(
              phone,
              path,
              mime,
              safeFilename(filename, `copynews-arquivo-${index + 1}`),
            );
            mediaSteps.push({
              status: "sent",
              message_id: id,
              mime_type: mime,
              filename,
            });
            sent += 1;
          } catch (error) {
            mediaSteps.push({ status: "failed", error: safeError(error) });
            failed += 1;
          }
          steps.media = mediaSteps;
          await persist();
          await sleep(700);
        }
      }
      const titleText =
        String(news.original_title || "").trim() ||
        (direct?.title_state === "failed"
          ? "Não foi possível identificar o título."
          : "Não há título na imagem.");
      const captionText =
        String(
          news.original_caption ||
            news.clean_original_caption ||
            news.source_caption ||
            "",
        ).trim() ||
        (direct?.caption_state === "failed"
          ? "Não foi possível obter a legenda da publicação."
          : "Não há legenda.");
      await step("title_label", () =>
        evolution.text(phone, "📰 *Título Original*"),
      );
      await step("title_content", () => evolution.text(phone, titleText));
      await step("caption_label", () =>
        evolution.text(phone, "📝 *Legenda Original*"),
      );
      await step("caption_content", () => evolution.text(phone, captionText));
      await step("combined_content", () =>
        evolution.text(
          phone,
          `📰 *Título Original*\n${titleText}\n\n📝 *Legenda Original*\n${captionText}`,
        ),
      );
      const all = [
        steps.link,
        ...(steps.media || []),
        steps.title_label,
        steps.title_content,
        steps.caption_label,
        steps.caption_content,
        steps.combined_content,
      ];
      const status = all.every((item) => item?.status === "sent")
        ? "success"
        : all.some((item) => item?.status === "sent")
          ? "partial"
          : "failed";
      const errors =
        all
          .filter((item) => item?.status === "failed")
          .map((item) => item.error)
          .filter(Boolean)
          .join("; ")
          .slice(0, 500) || null;
      await persist({
        status,
        sent_at: new Date().toISOString(),
        error_message: errors,
        lease_owner: null,
        lease_expires_at: null,
      });
      log("distribution.completed", { jobId: job.id, status, sent, failed });
    } catch (error) {
      const retry = job.attempts < 3;
      await persist({
        status: retry ? "queued" : "failed",
        error_message: safeError(error),
        lease_owner: null,
        lease_expires_at: null,
        ...(retry ? {} : { sent_at: new Date().toISOString() }),
      });
      log("distribution.failed", {
        jobId: job.id,
        retry,
        message: safeError(error),
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return {
    configured,
    claim,
    process: processJob,
    claimPreview,
    processPreview,
    monitorPreviews,
  };
}

export { imageMime, isCompatibleVideo, probeVideo };
