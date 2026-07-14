import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL: url,
  SUPABASE_SECRET_KEY: secret,
  CRON_SECRET: cronSecret,
} = process.env;
if (!url || !secret || !cronSecret)
  throw new Error("Missing cleanup test environment");

const admin = createClient(url, secret, { auth: { persistSession: false } });
const users = await admin.auth.admin.listUsers({ page: 1, perPage: 100 });
if (users.error) throw users.error;
const actor = users.data.users.find(
  (user) => user.email === "admin@copynews.local",
);
if (!actor) throw new Error("Initial admin not found");

const path = `cleanup-test/${randomUUID()}.mp4`;
let newsId;
try {
  const upload = await admin.storage
    .from("temporary-media")
    .upload(path, new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), {
      contentType: "video/mp4",
    });
  if (upload.error) throw upload.error;

  const inserted = await admin
    .from("news_items")
    .insert({
      source_url: "https://example.com/cleanup-test",
      source_platform: "web",
      created_by: actor.id,
      status: "draft",
      temporary_media_path: path,
      temporary_media_expires_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  newsId = inserted.data.id;

  const response = await fetch(`${url}/functions/v1/cleanup-temporary-media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      apikey: secret,
      "x-cron-secret": cronSecret,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const result = await response.json();
  if (!response.ok || result.removed < 1)
    throw new Error(
      `Cleanup failed: ${response.status} ${JSON.stringify(result)}`,
    );

  const [news, object] = await Promise.all([
    admin
      .from("news_items")
      .select("temporary_media_path")
      .eq("id", newsId)
      .single(),
    admin.storage.from("temporary-media").download(path),
  ]);
  if (news.error || news.data.temporary_media_path !== null)
    throw news.error || new Error("Expired media reference was not cleared");
  if (!object.error) throw new Error("Expired storage object still exists");

  console.log(
    JSON.stringify({
      ok: true,
      checks: ["expired object removed", "database reference cleared"],
    }),
  );
} finally {
  if (newsId) await admin.from("news_items").delete().eq("id", newsId);
  await admin.storage.from("temporary-media").remove([path]);
}
