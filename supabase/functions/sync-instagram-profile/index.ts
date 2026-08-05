import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function count(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : 0;
}

function optionalCount(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return count(value);
}

function normalizeUsername(input: string) {
  let candidate = input.trim().replace(/^@/, "");
  if (/^https?:\/\//i.test(candidate)) {
    const url = new URL(candidate);
    if (!url.hostname.toLowerCase().includes("instagram.com"))
      throw new Error("Informe um perfil do Instagram");
    const segment = url.pathname.split("/").filter(Boolean)[0] || "";
    if (["p", "reel", "reels", "tv", "stories"].includes(segment.toLowerCase()))
      throw new Error("Cole o link do perfil, não o link de uma publicação");
    candidate = segment;
  }
  candidate = candidate.split(/[/?#]/)[0].replace(/^@/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(candidate))
    throw new Error("Nome de usuário do Instagram inválido");
  return candidate.toLowerCase();
}

function objects(value: unknown, output: Record<string, unknown>[] = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const item of value) objects(item, output);
    return output;
  }
  const record = value as Record<string, unknown>;
  output.push(record);
  for (const item of Object.values(record)) objects(item, output);
  return output;
}

function first(record: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== null) return record[name];
  }
  return null;
}

function isoDate(value: unknown) {
  if (typeof value === "number") {
    const milliseconds = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function postCode(record: Record<string, unknown>) {
  const direct = text(first(record, ["shortcode", "code", "short_code"]));
  if (direct) return direct;
  const permalink = text(first(record, ["permalink", "post_url", "instagram_url", "url"]));
  return permalink?.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] || null;
}

function parsePayload(payload: unknown, requestedUsername: string) {
  const all = objects(payload);
  const profile = all.find((item) => {
    const username = text(first(item, ["username", "profile", "user_name"]));
    return username?.replace(/^@/, "").toLowerCase() === requestedUsername &&
      (item.followers !== undefined || item.followers_count !== undefined ||
        item.full_name !== undefined || item.fullName !== undefined ||
        item.profile_pic_url !== undefined || item.profilePicUrl !== undefined);
  }) || {};
  const seen = new Set<string>();
  const posts = all.flatMap((item) => {
    const code = postCode(item);
    if (!code || seen.has(code)) return [];
    const publishedAt = isoDate(first(item, [
      "published_at", "publishedAt", "date_utc", "date", "taken_at", "taken_at_timestamp",
      "timestamp", "created_at",
    ]));
    if (!publishedAt) return [];
    seen.add(code);
    const mediaType = text(first(item, ["type", "typename"]))?.toLowerCase();
    const isVideo = mediaType === "video" || Boolean(first(item, ["is_video", "video", "isVideo"]));
    return [{
      code,
      publishedAt,
      permalink: text(first(item, ["permalink", "post_url", "instagram_url", "url"])) ||
        `https://www.instagram.com/${isVideo ? "reel" : "p"}/${code}/`,
      caption: text(first(item, ["caption", "caption_text", "title", "description"])),
      thumbnail: text(first(item, [
        "thumbnail_url", "thumbnailUrl", "display_url", "image_url", "url_thumbnail",
      ])),
      likes: count(first(item, ["likes", "likes_count", "like_count"])),
      comments: count(first(item, ["comments", "comments_count", "comment_count"])),
      views: count(first(item, [
        "views", "view_count", "video_views", "videoViews", "video_view_count", "play_count",
      ])),
      raw: item,
    }];
  });
  return {
    profile: {
      displayName: text(first(profile, ["full_name", "fullName", "display_name", "name"])),
      avatarUrl: text(first(profile, ["profile_pic_url", "profilePicUrl", "profile_pic_url_hd", "avatar_url"])),
      followers: optionalCount(first(profile, ["followers", "followers_count", "edge_followed_by_count"])),
      following: optionalCount(first(profile, ["following", "following_count", "edge_follow_count"])),
      mediaCount: optionalCount(first(profile, ["media_count", "posts_count", "postsCount", "mediacount"])),
    },
    posts,
  };
}

function title(caption: string | null, username: string) {
  const line = caption?.split(/\n+/).map((item) => item.trim()).find(Boolean);
  if (!line) return `Publicação de @${username}`;
  return line.length > 140 ? `${line.slice(0, 137).trim()}...` : line;
}

function localDay(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: Deno.env.get("APP_TIMEZONE") || "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await auth.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: caller } = await admin
      .from("profiles")
      .select("role,is_active,organization_id")
      .eq("id", user.id)
      .single();
    if (!caller?.is_active) throw new Error("Unauthorized");
    if (!["admin", "editor", "writer"].includes(caller.role))
      throw new Error("Forbidden");

    const body = await req.json().catch(() => ({}));
    let trackedProfile = null;
    let username = "";
    if (body.profile_id) {
      const { data, error } = await admin
        .from("tracked_instagram_profiles")
        .select("*")
        .eq("id", String(body.profile_id))
        .eq("organization_id", caller.organization_id)
        .single();
      if (error || !data) throw new Error("Perfil acompanhado não encontrado");
      trackedProfile = data;
      username = data.username;
    } else {
      username = normalizeUsername(String(body.profile || ""));
      const { data } = await admin
        .from("tracked_instagram_profiles")
        .select("*")
        .eq("organization_id", caller.organization_id)
        .ilike("username", username)
        .maybeSingle();
      trackedProfile = data;
    }

    const response = await fetch(
      `${env("INSTALOADER_SERVICE_URL").replace(/\/$/, "")}/profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": env("INSTALOADER_SERVICE_API_KEY"),
        },
        body: JSON.stringify({ profile: username, limit: 12 }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = text((payload as Record<string, unknown>).detail) ||
        text((payload as Record<string, unknown>).error) ||
        `Instaloader HTTP ${response.status}`;
      if (trackedProfile) {
        await admin.from("tracked_instagram_profiles").update({
          last_sync_status: "error",
          last_error: detail,
        }).eq("id", trackedProfile.id);
      }
      throw new Error(detail);
    }

    const parsed = parsePayload(payload, username);
    const profileRow = {
      organization_id: caller.organization_id,
      username,
      display_name: parsed.profile.displayName,
      profile_url: `https://www.instagram.com/${username}/`,
      avatar_url: parsed.profile.avatarUrl,
      followers_count: parsed.profile.followers,
      following_count: parsed.profile.following,
      media_count: parsed.profile.mediaCount,
      last_sync_at: new Date().toISOString(),
      last_sync_status: "success",
      last_error: null,
    };
    if (trackedProfile) {
      const { data, error } = await admin
        .from("tracked_instagram_profiles")
        .update(profileRow)
        .eq("id", trackedProfile.id)
        .select()
        .single();
      if (error) throw error;
      trackedProfile = data;
    } else {
      const { data, error } = await admin
        .from("tracked_instagram_profiles")
        .insert({ ...profileRow, created_by: user.id })
        .select()
        .single();
      if (error) throw error;
      trackedProfile = data;
    }

    let imported = 0;
    let snapshots = 0;
    for (const post of parsed.posts) {
      const publicationRow = {
        tracked_profile_id: trackedProfile.id,
        external_media_id: post.code,
        title: title(post.caption, username),
        caption: post.caption,
        platform: "Instagram",
        published_url: post.permalink,
        published_at: post.publishedAt,
        credit_text: `@${username}`,
        source_type: "external",
        thumbnail_url: post.thumbnail,
        metadata_provider: "dbe-instaloader",
        metadata_fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      let { data: publication } = await admin
        .from("publications")
        .select("id")
        .eq("tracked_profile_id", trackedProfile.id)
        .eq("external_media_id", post.code)
        .maybeSingle();
      if (!publication) {
        const existing = await admin.from("publications")
          .select("id")
          .eq("published_url", post.permalink)
          .is("archived_at", null)
          .maybeSingle();
        publication = existing.data;
      }
      if (publication) {
        const { error } = await admin.from("publications")
          .update(publicationRow).eq("id", publication.id);
        if (error) throw error;
      } else {
        const { data, error } = await admin.from("publications")
          .insert({
            ...publicationRow,
            news_item_id: null,
            page_id: null,
            posted_by: null,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        publication = data;
      }
      imported += 1;
      const { error: metricError } = await admin.from("metric_snapshots").insert({
        publication_id: publication.id,
        source: "api",
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        reach: 0,
        impressions: 0,
        shares: 0,
        saves: 0,
        reposts: 0,
        clicks: 0,
        followers_gained: 0,
        raw_payload: { provider: "dbe-instaloader", post: post.raw },
        created_by: user.id,
      });
      if (metricError) throw metricError;
      snapshots += 1;
    }

    const today = localDay(new Date().toISOString());
    return json({
      profile: trackedProfile,
      imported,
      snapshots,
      posts_today: parsed.posts.filter((post) => localDay(post.publishedAt) === today).length,
      metrics_available: ["views", "likes", "comments"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return json({ error: message }, status);
  }
});
