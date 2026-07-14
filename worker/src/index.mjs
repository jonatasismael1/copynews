import { createServer } from "node:http";
import { promises as fs, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { acquireMedia, extractMetadata } from "./adapters.mjs";
import { generateCopy, readFrames, transcribeAudio } from "./openrouter.mjs";
import { buildSourceContext } from "./source-context.mjs";
const required = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "OPENROUTER_API_KEY",
  "COBALT_API_URL",
];
for (const key of required)
  if (!process.env[key]) throw new Error(`Missing ${key}`);
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);
const workerId = process.env.WORKER_ID || `worker-${randomUUID().slice(0, 8)}`;
const bucket = process.env.TEMP_MEDIA_BUCKET || "temporary-media";
const ttl = Number(process.env.TEMP_MEDIA_TTL_MINUTES || 120);
let busy = false;
const log = (event, extra = {}) =>
  console.log(
    JSON.stringify({ event, workerId, ...extra, at: new Date().toISOString() }),
  );
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, workerId, busy }));
    return;
  }
  res.writeHead(404);
  res.end();
}).listen(Number(process.env.PORT || 8080), () => log("worker.started"));
async function claim() {
  const { data: rows, error } = await db
    .from("processing_jobs")
    .select("*,news_items(*)")
    .in("status", ["queued", "retrying"])
    .or(
      `lease_expires_at.is.null,lease_expires_at.lt.${new Date().toISOString()}`,
    )
    .order("created_at")
    .limit(1);
  if (error) throw error;
  const job = rows?.[0];
  if (!job) return null;
  const { data, error: updateError } = await db
    .from("processing_jobs")
    .update({
      status: "running",
      lease_owner: workerId,
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
      started_at: job.started_at || new Date().toISOString(),
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .in("status", ["queued", "retrying"])
    .select()
    .maybeSingle();
  return updateError || !data ? null : { ...job, ...data };
}
async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} saiu com ${code}: ${stderr.slice(-500)}`)),
    );
  });
}
async function download(url, path) {
  const r = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok || !r.body)
    throw Object.assign(new Error(`Download HTTP ${r.status}`), {
      code: "MEDIA_DOWNLOAD",
    });
  const length = Number(r.headers.get("content-length") || 0);
  if (length > 100 * 1024 * 1024)
    throw Object.assign(new Error("Mídia excede 100 MB"), {
      code: "MEDIA_TOO_LARGE",
    });
  const file = createWriteStream(path);
  let bytes = 0;
  for await (const chunk of r.body) {
    bytes += chunk.length;
    if (bytes > 100 * 1024 * 1024) {
      file.destroy();
      throw Object.assign(new Error("Mídia excede 100 MB"), {
        code: "MEDIA_TOO_LARGE",
      });
    }
    if (!file.write(chunk))
      await new Promise((resolve) => file.once("drain", resolve));
  }
  file.end();
  await new Promise((resolve) => file.once("finish", resolve));
  return bytes;
}
async function update(jobId, values) {
  const { error } = await db
    .from("processing_jobs")
    .update({
      ...values,
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
    })
    .eq("id", jobId)
    .eq("lease_owner", workerId);
  if (error) throw error;
}
async function updateNews(newsId, values) {
  const { data, error } = await db
    .from("news_items")
    .update(values)
    .eq("id", newsId)
    .select("id")
    .maybeSingle();
  if (error)
    throw Object.assign(new Error(error.message), { code: "DATABASE_UPDATE" });
  if (!data)
    throw Object.assign(new Error("A notícia foi excluída durante o processamento"), {
      code: "NEWS_DELETED",
    });
}
async function processJob(job) {
  busy = true;
  const dir = join(tmpdir(), `copy-news-${job.id}`);
  await fs.mkdir(dir, { recursive: true });
  const media = join(dir, "source.mp4"),
    audioPattern = join(dir, "audio-%03d.mp3"),
    framesDir = join(dir, "frames");
  let results = job.step_results || {};
  try {
    log("job.started", { jobId: job.id });
    if (!results.validated) {
      new URL(job.news_items.source_url);
      results.validated = true;
      await update(job.id, {
        current_step: "fetch_metadata",
        progress: 8,
        step_results: results,
      });
    }
    if (!results.metadata) {
      results.metadata = await extractMetadata(job.news_items.source_url);
      await updateNews(job.news_items.id, {
        source_caption: results.metadata.caption,
        source_author: results.metadata.author,
      });
      await update(job.id, {
        current_step: "fetch_media",
        progress: 16,
        step_results: results,
      });
    }
    if (!results.media_path) {
      const acquired = await acquireMedia(job.news_items.source_url, {
        cobaltUrl: process.env.COBALT_API_URL,
        cobaltKey: process.env.COBALT_API_KEY,
      });
      const bytes = await download(acquired.mediaUrl, media);
      const path = `${job.news_items.created_by}/${job.news_items.id}/${randomUUID()}${extname(acquired.filename) || ".mp4"}`;
      const buffer = await fs.readFile(media);
      const { error } = await db.storage
        .from(bucket)
        .upload(path, buffer, { contentType: "video/mp4", upsert: false });
      if (error) throw error;
      results.media_path = path;
      results.media_bytes = bytes;
      await updateNews(job.news_items.id, {
        temporary_media_path: path,
        temporary_media_expires_at: new Date(
          Date.now() + ttl * 60_000,
        ).toISOString(),
        source_caption: results.metadata.caption,
        source_author: results.metadata.author,
      });
      await update(job.id, {
        current_step: "extract_audio",
        progress: 30,
        step_results: results,
      });
    } else {
      const { data, error } = await db.storage
        .from(bucket)
        .download(results.media_path);
      if (error) throw error;
      await fs.writeFile(media, Buffer.from(await data.arrayBuffer()));
    }
    if (!results.transcription_completed) {
      await run("ffmpeg", [
        "-y",
        "-i",
        media,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        "-f",
        "segment",
        "-segment_time",
        String(Number(process.env.TRANSCRIPTION_CHUNK_SECONDS || 600)),
        "-reset_timestamps",
        "1",
        audioPattern,
      ]);
      const audioFiles = (await fs.readdir(dir))
        .filter((name) => /^audio-\d+\.mp3$/.test(name))
        .sort();
      if (!audioFiles.length)
        throw Object.assign(
          new Error("A mídia não possui faixa de áudio utilizável"),
          { code: "MEDIA_HAS_NO_AUDIO" },
        );
      const transcripts = [];
      for (const name of audioFiles) {
        const audioData = (await fs.readFile(join(dir, name))).toString(
          "base64",
        );
        const part = await transcribeAudio(
          audioData,
          process.env.OPENROUTER_API_KEY,
          process.env.OPENROUTER_TRANSCRIPTION_MODEL ||
            "openai/whisper-large-v3",
        );
        if (part) transcripts.push(part);
      }
      results.transcript = transcripts.join("\n\n");
      results.transcription_completed = true;
      results.transcription_empty = !results.transcript;
      await updateNews(job.news_items.id, {
        transcript: results.transcript,
        transcript_language: "pt",
      });
      await update(job.id, {
        current_step: "extract_ocr",
        progress: 55,
        step_results: results,
      });
    }
    if (!results.ocr) {
      await fs.mkdir(framesDir, { recursive: true });
      await run("ffmpeg", [
        "-y",
        "-i",
        media,
        "-vf",
        "fps=1/5,scale=960:-1",
        "-frames:v",
        "8",
        "-q:v",
        "4",
        join(framesDir, "frame-%02d.jpg"),
      ]);
      const names = await fs.readdir(framesDir);
      const frames = await Promise.all(
        names
          .slice(0, 8)
          .map(async (n) =>
            (await fs.readFile(join(framesDir, n))).toString("base64"),
          ),
      );
      results.ocr = await readFrames(
        frames,
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4.1-mini",
      );
      await updateNews(job.news_items.id, {
        ocr_text: results.ocr.text || "",
        ocr_confidence: results.ocr.confidence,
      });
      await update(job.id, {
        current_step: "generate_copy",
        progress: 76,
        step_results: results,
      });
    }
    if (!results.copy) {
      results.copy = await generateCopy(
        buildSourceContext(results),
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini",
      );
      if (results.transcription_empty) {
        results.copy.warnings = [
          "Não foi identificada fala no vídeo; o texto foi produzido a partir da legenda e/ou do OCR.",
          ...results.copy.warnings,
        ];
      }
      await updateNews(job.news_items.id, {
        generated_title: results.copy.title,
        generated_caption: results.copy.caption,
        summary: results.copy.summary,
        ai_confidence: results.copy.confidence,
        ai_warnings: results.copy.warnings,
        detected_facts: results.copy.detected_facts,
        status: "draft",
      });
    }
    await update(job.id, {
      current_step: "completed",
      status: "completed",
      progress: 100,
      step_results: results,
      finished_at: new Date().toISOString(),
      lease_owner: null,
      lease_expires_at: null,
    });
    log("job.completed", { jobId: job.id });
  } catch (error) {
    log("job.failed", {
      jobId: job.id,
      message: error.message,
      code: error.code,
    });
    if (error.code === "NEWS_DELETED" && results.media_path) {
      await db.storage.from(bucket).remove([results.media_path]);
      log("job.deleted_media_cleaned", { jobId: job.id });
    }
    await db
      .from("processing_jobs")
      .update({
        status: "failed",
        error_code: error.code || "PROCESSING_ERROR",
        error_message: String(error.message).slice(0, 500),
        step_results: results,
        lease_owner: null,
        lease_expires_at: null,
      })
      .eq("id", job.id);
    await updateNews(job.news_items.id, { status: "failed" }).catch(
      (newsError) =>
        log("job.failure_status_update_failed", {
          jobId: job.id,
          message: newsError.message,
        }),
    );
  } finally {
    busy = false;
    await fs.rm(dir, { recursive: true, force: true });
  }
}
async function cleanup() {
  const { data } = await db
    .from("news_items")
    .select("id,temporary_media_path")
    .not("temporary_media_path", "is", null)
    .lt("temporary_media_expires_at", new Date().toISOString())
    .limit(100);
  const paths = (data || []).map((x) => x.temporary_media_path).filter(Boolean);
  if (paths.length) {
    await db.storage.from(bucket).remove(paths);
    await db
      .from("news_items")
      .update({ temporary_media_path: null, temporary_media_expires_at: null })
      .in(
        "id",
        data.map((x) => x.id),
      );
    log("cleanup.completed", { count: paths.length });
  }
}
async function loop() {
  if (!busy) {
    try {
      const job = await claim();
      if (job) await processJob(job);
    } catch (error) {
      log("loop.error", { message: error.message });
    }
  }
  setTimeout(loop, 3000);
}
setInterval(
  () =>
    cleanup().catch((error) =>
      log("cleanup.error", { message: error.message }),
    ),
  15 * 60_000,
).unref();
loop();
