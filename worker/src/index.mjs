import { createServer } from "node:http";
import { promises as fs, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  acquireMedia,
  extractMetadata,
  isInstagramReelUrl,
  isYouTubeUrl,
  isVideoMediaItem,
  selectDownloadableMedia,
} from "./adapters.mjs";
import {
  cleanSourceCaption,
  generateCopy,
  normalizeHeadlineCase,
  readFrames,
  transcribeAudio,
} from "./openrouter.mjs";
import { buildSourceContext } from "./source-context.mjs";
import { shouldTranscribe } from "./processing-options.mjs";
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
  return {
    bytes,
    contentType: (r.headers.get("content-type") || "")
      .split(";")[0]
      .toLowerCase(),
  };
}

async function downloadVideoWithYtDlp(sourceUrl, dir, basename = "source-video") {
  const output = join(dir, `${basename}.mp4`);
  const outputTemplate = join(dir, `${basename}.%(ext)s`);
  await run("yt-dlp", [
    "--no-playlist",
    "--no-part",
    "--no-write-thumbnail",
    "--force-overwrites",
    "--max-filesize",
    "100M",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
    "--format",
    "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/best[vcodec^=avc1][acodec^=mp4a]/best[ext=mp4]/best",
    "--remux-video",
    "mp4",
    "--output",
    outputTemplate,
    sourceUrl,
  ]);
  const stats = await fs.stat(output);
  if (!stats.size || stats.size > 100 * 1024 * 1024)
    throw Object.assign(new Error("Mídia excede 100 MB"), {
      code: "MEDIA_TOO_LARGE",
    });
  return {
    mediaItems: [
      {
        localPath: output,
        type: "video",
        filename: `${basename}.mp4`,
      },
    ],
    filename: `${basename}.mp4`,
    fallbackProvider: "yt-dlp",
  };
}

function mediaKind(type, contentType) {
  const value = `${type || ""} ${contentType || ""}`.toLowerCase();
  if (value.includes("image") || value.includes("photo")) return "image";
  if (value.includes("video")) return "video";
  return "video";
}

function mediaExtension(filename, kind, contentType) {
  const existing = extname(filename || "");
  if (existing) return existing;
  if (contentType === "image/png") return ".png";
  if (contentType === "image/webp") return ".webp";
  if (kind === "image") return ".jpg";
  return ".mp4";
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
async function editorialSources(newsId) {
  const { data, error } = await db
    .from("news_items")
    .select("original_title,original_caption,clean_original_caption")
    .eq("id", newsId)
    .single();
  if (error)
    throw Object.assign(new Error(error.message), { code: "DATABASE_READ" });
  return data;
}
const normalizeLookup = (value = "") =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

async function activeCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id,name")
    .eq("is_active", true)
    .order("name");
  if (error)
    throw Object.assign(new Error(error.message), { code: "DATABASE_READ" });
  return data || [];
}

function categoryIdForSuggestion(categories, suggestion) {
  const target = normalizeLookup(suggestion);
  if (!target) return null;
  return categories.find((category) => normalizeLookup(category.name) === target)?.id || null;
}
async function processJob(job) {
  busy = true;
  const dir = join(tmpdir(), `copy-news-${job.id}`);
  await fs.mkdir(dir, { recursive: true });
  const framesDir = join(dir, "frames");
  let mediaFiles = [];
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
      results.original_caption = results.metadata.caption || null;
      results.clean_original_caption = cleanSourceCaption(
        results.metadata.caption,
      ) || null;
      results.original_title = normalizeHeadlineCase(
        results.metadata.title || "",
        results.clean_original_caption || "",
      ) || null;
      await updateNews(job.news_items.id, {
        source_caption: results.metadata.caption,
        original_caption: results.original_caption,
        clean_original_caption: results.clean_original_caption,
        original_title: results.original_title,
        source_author: results.metadata.author,
      });
      await update(job.id, {
        current_step: "fetch_media",
        progress: 16,
        step_results: results,
      });
    }
    if (!results.media_path && !results.media_unavailable) {
      let acquired = null;
      if (results.metadata.provider === "web-article") {
        acquired = results.metadata.mediaItems?.length
          ? {
              mediaItems: results.metadata.mediaItems,
              filename: results.metadata.mediaItems[0].filename,
            }
          : null;
      } else {
        try {
          acquired = isYouTubeUrl(job.news_items.source_url)
            ? await downloadVideoWithYtDlp(
                job.news_items.source_url,
                dir,
                "youtube-video",
              )
            : await acquireMedia(job.news_items.source_url, {
                cobaltUrl: process.env.COBALT_API_URL,
                cobaltKey: process.env.COBALT_API_KEY,
              });
          if (isYouTubeUrl(job.news_items.source_url))
            log("media.youtube_video_acquired", {
              jobId: job.id,
              provider: "yt-dlp",
            });
          if (
            isInstagramReelUrl(job.news_items.source_url) &&
            !acquired.mediaItems.some(isVideoMediaItem)
          ) {
            log("media.reel_cover_returned", { jobId: job.id });
            try {
              acquired = await downloadVideoWithYtDlp(
                job.news_items.source_url,
                dir,
                "instagram-reel",
              );
              log("media.reel_video_recovered", {
                jobId: job.id,
                provider: "yt-dlp",
              });
            } catch (fallbackError) {
              log("media.reel_video_unavailable", {
                jobId: job.id,
                message: fallbackError.message,
              });
              acquired.mediaItems = acquired.mediaItems.map((item) => ({
                ...item,
                auditOnly: true,
              }));
            }
          }
        } catch (error) {
          log("media.provider_unavailable", {
            jobId: job.id,
            code: error.code,
            message: error.message,
          });
          if (isYouTubeUrl(job.news_items.source_url)) {
            try {
              acquired = await downloadVideoWithYtDlp(
                job.news_items.source_url,
                dir,
                "youtube-video",
              );
              log("media.youtube_video_recovered", {
                jobId: job.id,
                provider: "yt-dlp",
              });
            } catch (fallbackError) {
              log("media.youtube_video_unavailable", {
                jobId: job.id,
                message: fallbackError.message,
              });
            }
          }
          if (!results.metadata.mediaItems?.length) {
            const refreshed = await extractMetadata(job.news_items.source_url);
            if (refreshed.caption || refreshed.mediaItems?.length) {
              results.metadata = refreshed;
              results.original_caption = refreshed.caption || null;
              results.clean_original_caption = cleanSourceCaption(
                refreshed.caption,
              ) || null;
              results.original_title = normalizeHeadlineCase(
                refreshed.title || "",
                results.clean_original_caption || "",
              ) || null;
              await updateNews(job.news_items.id, {
                source_caption: refreshed.caption,
                original_caption: results.original_caption,
                clean_original_caption: results.clean_original_caption,
                original_title: results.original_title,
                source_author: refreshed.author,
              });
            }
          }
          if (!acquired && results.metadata.mediaItems?.length) {
            acquired = {
              mediaItems: results.metadata.mediaItems.map((item) => ({
                ...item,
                auditOnly: isInstagramReelUrl(job.news_items.source_url),
              })),
              filename: results.metadata.mediaItems[0].filename,
            };
          } else if (!results.metadata.caption) {
            throw error;
          }
        }
      }
      if (
        isYouTubeUrl(job.news_items.source_url) &&
        acquired &&
        !acquired.mediaItems.some(isVideoMediaItem)
      ) {
        acquired = await downloadVideoWithYtDlp(
          job.news_items.source_url,
          dir,
          "youtube-video",
        );
        log("media.youtube_nonvideo_replaced", {
          jobId: job.id,
          provider: "yt-dlp",
        });
      }
      for (const [index, item] of (acquired?.mediaItems || []).entries()) {
        try {
          const localPath = item.localPath ||
            join(dir, `source-${index}${extname(item.filename)}`);
          const downloaded = item.localPath
            ? {
                bytes: (await fs.stat(item.localPath)).size,
                contentType: "video/mp4",
              }
            : await download(item.url, localPath);
          const kind = mediaKind(item.type, downloaded.contentType);
          const extension = mediaExtension(
            item.filename,
            kind,
            downloaded.contentType,
          );
          const correctedPath = `${localPath}${extname(localPath) ? "" : extension}`;
          if (correctedPath !== localPath)
            await fs.rename(localPath, correctedPath);
          const contentType =
            downloaded.contentType.startsWith("image/") ||
            downloaded.contentType.startsWith("video/")
              ? downloaded.contentType
              : kind === "image"
                ? "image/jpeg"
                : "video/mp4";
          mediaFiles.push({
            path: correctedPath,
            kind,
            contentType,
            bytes: downloaded.bytes,
            source: item,
            auditOnly: item.auditOnly === true,
          });
        } catch (error) {
          log("media.item_unavailable", {
            jobId: job.id,
            mediaIndex: index,
            message: error.message,
          });
        }
      }
      const primary = selectDownloadableMedia(mediaFiles);
      if (!primary) {
        if (!results.metadata.caption) {
          throw Object.assign(
            new Error("A origem não forneceu mídia nem conteúdo textual utilizável"),
            { code: "INSUFFICIENT_SOURCE" },
          );
        }
        results.media_unavailable = true;
        results.media_kind = "text";
        results.media_items = [];
        await update(job.id, {
          current_step: "extract_ocr",
          progress: 30,
          step_results: results,
        });
      } else {
        const extension = mediaExtension(
          acquired?.filename || primary.source.filename,
          primary.kind,
          primary.contentType,
        );
        const path = `${job.news_items.created_by}/${job.news_items.id}/${randomUUID()}${extension}`;
        const buffer = await fs.readFile(primary.path);
        const { error } = await db.storage
          .from(bucket)
          .upload(path, buffer, {
            contentType: primary.contentType,
            upsert: false,
          });
        if (error) throw error;
        results.media_path = path;
        results.media_bytes = mediaFiles.reduce(
          (total, item) => total + item.bytes,
          0,
        );
        results.media_kind = mediaFiles.length > 1 ? "carousel" : primary.kind;
        results.media_items = mediaFiles.map((item) => ({
          source: item.source,
          kind: item.kind,
          contentType: item.contentType,
        }));
        await updateNews(job.news_items.id, {
          temporary_media_path: path,
          temporary_media_expires_at: new Date(
            Date.now() + ttl * 60_000,
          ).toISOString(),
          source_caption: results.metadata.caption,
          original_caption: results.original_caption,
          clean_original_caption: results.clean_original_caption,
          original_title: results.original_title,
          source_author: results.metadata.author,
        });
        await update(job.id, {
          current_step: shouldTranscribe(job.news_items)
            ? "extract_audio"
            : "extract_ocr",
          progress: 30,
          step_results: results,
        });
      }
    } else if (results.media_path) {
      const { data, error } = await db.storage
        .from(bucket)
        .download(results.media_path);
      if (error) throw error;
      const primaryItem = results.media_items?.[0] || {};
      const primaryPath = join(
        dir,
        `source-0${extname(results.media_path) || mediaExtension("", primaryItem.kind, primaryItem.contentType)}`,
      );
      await fs.writeFile(primaryPath, Buffer.from(await data.arrayBuffer()));
      mediaFiles.push({
        path: primaryPath,
        kind: primaryItem.kind || mediaKind("", data.type),
        contentType: primaryItem.contentType || data.type,
        source: primaryItem.source || {},
      });
      if ((results.media_items?.length || 0) > 1) {
        const acquired = await acquireMedia(job.news_items.source_url, {
          cobaltUrl: process.env.COBALT_API_URL,
          cobaltKey: process.env.COBALT_API_KEY,
        });
        for (const [index, item] of acquired.mediaItems.slice(1).entries()) {
          const localPath = join(
            dir,
            `source-${index + 1}${extname(item.filename) || ".media"}`,
          );
          const downloaded = await download(item.url, localPath);
          mediaFiles.push({
            path: localPath,
            kind: mediaKind(item.type, downloaded.contentType),
            contentType: downloaded.contentType,
            bytes: downloaded.bytes,
            source: item,
          });
        }
      }
    }
    if (!results.transcription_completed && shouldTranscribe(job.news_items)) {
      const videoFiles = mediaFiles.filter((item) => item.kind === "video");
      for (const [index, item] of videoFiles.entries()) {
        await run("ffmpeg", [
          "-y",
          "-i",
          item.path,
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
          join(dir, `audio-${index}-%03d.mp3`),
        ]).catch((error) =>
          log("media.audio_unavailable", {
            jobId: job.id,
            mediaIndex: index,
            message: error.message,
          }),
        );
      }
      const audioFiles = (await fs.readdir(dir))
        .filter((name) => /^audio-\d+-\d+\.mp3$/.test(name))
        .sort();
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
    if (!results.transcription_completed && !shouldTranscribe(job.news_items)) {
      results.transcript = "";
      results.transcription_completed = true;
      results.transcription_empty = true;
      results.transcription_skipped = true;
      await updateNews(job.news_items.id, {
        transcript: null,
        transcript_language: null,
      });
      await update(job.id, {
        current_step: "extract_ocr",
        progress: 55,
        step_results: results,
      });
    }
    if (!results.ocr) {
      if (!mediaFiles.length) {
        results.ocr = { text: "", confidence: null };
      } else {
        await fs.mkdir(framesDir, { recursive: true });
        const framesPerMedia = Math.max(1, Math.floor(8 / mediaFiles.length));
        for (const [index, item] of mediaFiles.entries()) {
        const output = join(framesDir, `frame-${index}-%02d.jpg`);
        const args =
          item.kind === "image"
            ? [
                "-y",
                "-i",
                item.path,
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
                "-i",
                item.path,
                "-vf",
                "fps=1/5,scale=960:-1",
                "-frames:v",
                String(framesPerMedia),
                "-q:v",
                "4",
                output,
              ];
          await run("ffmpeg", args);
        }
        const names = await fs.readdir(framesDir);
        const frames = await Promise.all(
          names
            .slice(0, 8)
            .map(async (n) =>
              (await fs.readFile(join(framesDir, n))).toString("base64"),
            ),
        );
        results.ocr = frames.length
          ? await readFrames(
              frames,
              process.env.OPENROUTER_API_KEY,
              process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4.1-mini",
            )
          : { text: "", confidence: 0 };
      }
      if (!results.original_title && results.ocr.title)
        results.original_title = normalizeHeadlineCase(
          results.ocr.title,
          results.clean_original_caption || "",
        );
      await updateNews(job.news_items.id, {
        raw_ocr_text: results.ocr.text || "",
        ocr_text: results.ocr.text || "",
        ocr_confidence: results.ocr.confidence,
        original_title: results.original_title || null,
      });
      await update(job.id, {
        current_step: "generate_copy",
        progress: 76,
        step_results: results,
      });
    }
    if (!results.copy) {
      const persistedEditorialSources = await editorialSources(
        job.news_items.id,
      );
      const categories = await activeCategories();
      results.copy = await generateCopy(
        buildSourceContext({
          ...results,
          ...persistedEditorialSources,
          available_categories: categories.map((category) => category.name),
          editorial_sources_loaded: true,
        }),
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_REWRITE_MODEL ||
          process.env.OPENROUTER_MODEL ||
          "x-ai/grok-4.3",
      );
      if (results.transcription_empty) {
        const sourceKind = results.media_kind || "video";
        results.copy.warnings = [
          sourceKind === "text"
            ? "A mídia não estava disponível; o texto foi produzido a partir do conteúdo original recuperado da página."
          : results.transcription_skipped
            ? "A transcrição foi desativada; o texto foi produzido a partir da legenda original e do conteúdo visual."
            : sourceKind === "image"
            ? "A origem é uma imagem estática; o texto foi produzido a partir da legenda e do conteúdo visual."
            : sourceKind === "carousel"
              ? "Não foi identificada fala utilizável no carrossel; o texto foi produzido a partir da legenda e dos itens visuais."
            : "Não foi identificada fala no vídeo; o texto foi produzido a partir das fontes editoriais disponíveis.",
          ...results.copy.warnings,
        ];
      }
      await updateNews(job.news_items.id, {
        generated_title: results.copy.title,
        generated_caption: results.copy.caption,
        highlight: results.copy.highlight,
        editorial_tone: results.copy.editorial_tone,
        summary: results.copy.summary,
        category_id: categoryIdForSuggestion(
          categories,
          results.copy.category_suggestion,
        ),
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
