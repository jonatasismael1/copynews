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

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const adminClient = () =>
  createClient(
    env("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

type StorageEntry = {
  id?: string | null;
  name: string;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

async function expiredPaths(
  admin: ReturnType<typeof adminClient>,
  bucket: string,
  cutoff: Date,
) {
  const expired: string[] = [];
  const pending = [""];
  while (pending.length) {
    const prefix = pending.shift()!;
    for (let offset = 0;; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;
      const entries = (data || []) as StorageEntry[];
      for (const entry of entries) {
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!entry.id && !entry.metadata) pending.push(path);
        else if (entry.created_at && new Date(entry.created_at) < cutoff)
          expired.push(path);
      }
      if (entries.length < 1000) break;
    }
  }
  return expired;
}

function chunks<T>(items: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

async function clearMediaReferences(
  admin: ReturnType<typeof adminClient>,
  removed: string[],
) {
  if (!removed.length) return;
  for (const paths of chunks(removed)) {
    const { error: generatedError } = await admin.from("generated_media")
      .delete().in("storage_path", paths);
    if (generatedError) throw generatedError;

    for (const column of ["media_asset_path", "preview_path", "exported_file_path"]) {
      const { error } = await admin.from("news_designs")
        .update({ [column]: null }).in(column, paths);
      if (error) throw error;
    }
    for (const column of ["media_asset_path", "preview_path", "exported_file_path"]) {
      const { error } = await admin.from("news_design_versions")
        .update({ [column]: null }).in(column, paths);
      if (error) throw error;
    }

    const { data: primaryMatches, error: primaryError } = await admin
      .from("news_items")
      .select("id,temporary_media_path,temporary_media_paths,temporary_media_expires_at")
      .in("temporary_media_path", paths);
    if (primaryError) throw primaryError;
    const { data: carouselMatches, error: carouselError } = await admin
      .from("news_items")
      .select("id,temporary_media_path,temporary_media_paths,temporary_media_expires_at")
      .overlaps("temporary_media_paths", paths);
    if (carouselError) throw carouselError;
    const affected = new Map(
      [...(primaryMatches || []), ...(carouselMatches || [])].map((item) => [
        item.id,
        item,
      ]),
    );
    for (const item of affected.values()) {
      const remaining = (item.temporary_media_paths || []).filter(
        (path: string) => !paths.includes(path),
      );
      const primary = paths.includes(item.temporary_media_path)
        ? remaining[0] || null
        : item.temporary_media_path;
      const { error } = await admin.from("news_items").update({
        temporary_media_path: primary,
        temporary_media_paths: remaining,
        temporary_media_expires_at: remaining.length ? item.temporary_media_expires_at : null,
      }).eq("id", item.id);
      if (error) throw error;
    }
  }
}

async function deleteOlderThan(
  admin: ReturnType<typeof adminClient>,
  table: string,
  column: string,
  cutoff: string,
) {
  const { data, error } = await admin.from(table).delete().lt(column, cutoff)
    .select(column);
  if (error) throw error;
  return data?.length || 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (req.headers.get("x-cron-secret") !== env("CRON_SECRET"))
      throw new Error("Unauthorized");

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const now = Date.now();
    const mediaCutoff = new Date(now - 48 * 60 * 60 * 1000);
    const dataCutoff = new Date(now);
    dataCutoff.setUTCMonth(dataCutoff.getUTCMonth() - 3);
    const admin = adminClient();

    const candidates: Record<string, string[]> = {};
    for (const bucket of ["temporary-media", "news-designs"])
      candidates[bucket] = await expiredPaths(admin, bucket, mediaCutoff);

    if (dryRun) {
      return json({
        dry_run: true,
        media_cutoff: mediaCutoff.toISOString(),
        data_cutoff: dataCutoff.toISOString(),
        media_candidates: Object.fromEntries(
          Object.entries(candidates).map(([bucket, paths]) => [bucket, paths.length]),
        ),
      });
    }

    const removed: string[] = [];
    const removedByBucket: Record<string, number> = {};
    for (const [bucket, paths] of Object.entries(candidates)) {
      for (const batch of chunks(paths)) {
        const { data, error } = await admin.storage.from(bucket).remove(batch);
        if (error) throw error;
        removed.push(...(data || []).map((item) => item.name));
      }
      removedByBucket[bucket] = paths.length;
    }
    await clearMediaReferences(admin, removed);

    const deleted = {
      news_send_history: await deleteOlderThan(admin, "news_send_history", "created_at", dataCutoff.toISOString()),
      distribution_direct_previews: await deleteOlderThan(admin, "distribution_direct_previews", "created_at", dataCutoff.toISOString()),
      news_items: await deleteOlderThan(admin, "news_items", "created_at", dataCutoff.toISOString()),
      publications: await deleteOlderThan(admin, "publications", "published_at", dataCutoff.toISOString()),
      metric_snapshots: await deleteOlderThan(admin, "metric_snapshots", "captured_at", dataCutoff.toISOString()),
      instagram_profile_daily_stats: await deleteOlderThan(
        admin,
        "instagram_profile_daily_stats",
        "report_date",
        dataCutoff.toISOString().slice(0, 10),
      ),
      audit_logs: await deleteOlderThan(admin, "audit_logs", "created_at", dataCutoff.toISOString()),
      instagram_collection_runs: await deleteOlderThan(admin, "instagram_collection_runs", "started_at", dataCutoff.toISOString()),
      instagram_posts: await deleteOlderThan(admin, "instagram_posts", "published_at", dataCutoff.toISOString()),
      oauth_states: await deleteOlderThan(admin, "oauth_states", "expires_at", new Date().toISOString()),
    };

    return json({
      media_cutoff: mediaCutoff.toISOString(),
      data_cutoff: dataCutoff.toISOString(),
      removed_media: removedByBucket,
      deleted,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    console.error(JSON.stringify({ event: "retention_cleanup_failed", message }));
    return json({ error: message }, status);
  }
});
