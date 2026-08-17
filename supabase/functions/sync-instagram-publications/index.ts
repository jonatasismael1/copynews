import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../_shared/token-crypto.ts";

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
const version = () => Deno.env.get("META_GRAPH_API_VERSION") || "v25.0";
const reportTimezone = () =>
  (Deno.env.get("APP_TIMEZONE") || "America/Maceio").replace(/["']/g, "").trim();

function number(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("pt-BR");
}

function localDateTime(value = new Date()) {
  return {
    date: new Intl.DateTimeFormat("pt-BR", {
      timeZone: reportTimezone(), day: "2-digit", month: "2-digit", year: "numeric",
    }).format(value),
    time: new Intl.DateTimeFormat("pt-BR", {
      timeZone: reportTimezone(), hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(value),
  };
}

async function sendEvolutionMessages(messages: string[]) {
  if (Deno.env.get("INSTAGRAM_WHATSAPP_ALERTS_ENABLED") !== "true") return "disabled";
  const baseUrl = env("EVOLUTION_API_URL").replace(/\/$/, "");
  const apiKey = env("EVOLUTION_API_KEY");
  const instance = env("EVOLUTION_INSTANCE");
  const number = env("INSTAGRAM_ALERT_PHONE").replace(/\D/g, "");
  for (const message of messages) {
    let sent = false;
    for (let attempt = 1; attempt <= 2 && !sent; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
          method: "POST",
          headers: { apikey: apiKey, "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ number, text: message }),
          signal: AbortSignal.timeout(8_000),
        });
        sent = response.ok;
        console.info(JSON.stringify({
          event: sent ? "notification_sent" : "notification_failed",
          response_status: response.status,
          attempt,
        }));
      } catch {
        console.warn(JSON.stringify({ event: "notification_failed", response_status: "network_error", attempt }));
      }
    }
    if (!sent) return "failed";
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return "sent";
}

async function refreshInstagramToken(token: string) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error?.message || "Não foi possível renovar o acesso do Instagram",
    );
  }
  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 0),
  };
}

async function exchangeLongInstagramToken(token: string) {
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", env("INSTAGRAM_APP_SECRET"));
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error?.message || "Não foi possível obter o token longo do Instagram");
  }
  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 0),
  };
}

async function graph(
  path: string,
  token: string,
  params: Record<string, string> = {},
  instagramLogin = false,
) {
  const url = new URL(
    path.startsWith("http")
      ? path
      : instagramLogin
      ? `https://graph.instagram.com/${path.replace(/^\//, "")}`
      : `https://graph.facebook.com/${version()}/${path.replace(/^\//, "")}`,
  );
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  url.searchParams.set("access_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const payload = await response.json();
  if (!response.ok || payload.error)
    throw new Error(payload.error?.message || `Instagram API ${response.status}`);
  return payload;
}

async function insight(
  mediaId: string,
  metric: string,
  token: string,
  instagramLogin: boolean,
) {
  try {
    const payload = await graph(
      `${mediaId}/insights`,
      token,
      { metric },
      instagramLogin,
    );
    const item = payload.data?.[0];
    const value = item?.values?.[0]?.value ?? item?.total_value?.value ?? item?.value;
    return { value: value == null ? null : Number(value), payload };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function titleFromCaption(caption?: string | null) {
  const first = caption?.split(/\n+/).map((line) => line.trim()).find(Boolean);
  if (!first) return "Publicação do Instagram";
  return first.length > 140 ? `${first.slice(0, 137).trim()}...` : first;
}

async function caller(req: Request, admin: ReturnType<typeof createClient>) {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === env("META_SYNC_CRON_SECRET"))
    return { userId: null, role: "admin", scheduled: true };
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (!profile?.is_active || !["admin", "editor", "writer"].includes(profile.role))
    throw new Error("Forbidden");
  return { userId: user.id, role: profile.role, scheduled: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const identity = await caller(req, admin);
    const body = await req.json().catch(() => ({}));
    let accountQuery = admin
      .from("connected_accounts")
      .select("*")
      .eq("provider", "instagram")
      .eq("status", "connected");
    if (body.account_id) accountQuery = accountQuery.eq("id", body.account_id);
    if (!identity.scheduled && identity.role !== "admin")
      accountQuery = accountQuery.eq("user_id", identity.userId);
    const { data: accounts, error: accountError } = await accountQuery;
    if (accountError) throw accountError;

    const summaries = [];
    const reportSummaries: Array<Record<string, unknown>> = [];
    for (const account of accounts || []) {
      if (!identity.scheduled && identity.role === "admin" && body.account_id &&
          account.user_id !== identity.userId && body.sync_all !== true) {
        throw new Error("Forbidden");
      }
      let token = await decryptToken(
        account.encrypted_access_token,
        env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
      );
      const instagramLogin = (account.scopes || []).includes(
        "instagram_business_basic",
      );
      const expiresAt = account.token_expires_at
        ? Date.parse(account.token_expires_at)
        : null;
      if (
        instagramLogin && expiresAt &&
        expiresAt - Date.now() < 7 * 86400000
      ) {
        try {
          const refreshed = account.refresh_error === "long_token_exchange_pending"
            ? await exchangeLongInstagramToken(token)
            : await refreshInstagramToken(token);
          token = refreshed.accessToken;
          const encrypted = await encryptToken(
            token,
            env("CONNECTED_ACCOUNT_ENCRYPTION_KEY"),
          );
          await admin.from("connected_accounts").update({
            encrypted_access_token: encrypted,
            token_expires_at: refreshed.expiresIn > 0
              ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
              : account.token_expires_at,
            last_refresh_at: new Date().toISOString(),
            refresh_error: null,
            needs_attention: false,
          }).eq("id", account.id);
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 240) : "Falha na renovação";
          await admin.from("connected_accounts").update({
            refresh_error: message,
            needs_attention: true,
            status: expiresAt <= Date.now() ? "expired" : "connected",
          }).eq("id", account.id);
          if (expiresAt <= Date.now()) continue;
        }
      }
      const initialFrom = account.last_sync_at
        ? new Date(Date.parse(account.last_sync_at) - 24 * 60 * 60 * 1000)
        : new Date(account.sync_from || Date.now() - 90 * 86400000);
      const since = String(Math.floor(initialFrom.getTime() / 1000));
      // Instagram Login tokens address the authorized account through `me`.
      // Using the numeric id returned by the token exchange produces
      // "Unknown path components: /media" on graph.instagram.com.
      let next: string | null = instagramLogin
        ? "me/media"
        : `${account.provider_account_id}/media`;
      let params: Record<string, string> = {
        fields:
          "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,username,like_count,comments_count",
        limit: "100",
      };
      // Media collections only support time-based pagination on the Facebook
      // Login variant. Instagram Login uses cursor pagination.
      if (!instagramLogin) params.since = since;
      const media: Record<string, unknown>[] = [];
      for (let page = 0; next && page < 10; page += 1) {
        const payload = await graph(next, token, params, instagramLogin);
        media.push(...(payload.data || []));
        next = payload.paging?.next || null;
        params = {};
      }

      let imported = 0;
      let snapshots = 0;
      let views = 0;
      let reach = 0;
      let likes = 0;
      let comments = 0;
      let shares = 0;
      let saves = 0;
      for (const item of media) {
        const mediaId = String(item.id);
        const row = {
          connected_account_id: account.id,
          external_media_id: mediaId,
          news_item_id: null,
          title: titleFromCaption(String(item.caption || "")),
          caption: item.caption ? String(item.caption) : null,
          platform: "Instagram",
          page_id: account.page_id,
          published_url: String(item.permalink),
          published_at: String(item.timestamp),
          posted_by: account.user_id,
          credit_text: item.username ? `@${item.username}` : account.account_name,
          source_type: "external",
          created_by: account.user_id,
          thumbnail_url: String(item.thumbnail_url || item.media_url || "") || null,
          metadata_provider: "meta-graph-api",
          metadata_fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: publication, error: publicationError } = await admin
          .from("publications")
          .upsert(row, { onConflict: "connected_account_id,external_media_id" })
          .select("id")
          .single();
        if (publicationError) throw publicationError;
        imported += 1;
        const metricNames = ["views", "reach", "shares", "saved", "reposts"];
        const entries = await Promise.all(
          metricNames.map(async (name) => [
            name,
            await insight(mediaId, name, token, instagramLogin),
          ] as const),
        );
        const metrics = Object.fromEntries(entries);
        views += Number(metrics.views.value || 0);
        reach += Number(metrics.reach.value || 0);
        likes += Number(item.like_count || 0);
        comments += Number(item.comments_count || 0);
        shares += Number(metrics.shares.value || 0);
        saves += Number(metrics.saved.value || 0);
        const { error: metricError } = await admin.from("metric_snapshots").insert({
          publication_id: publication.id,
          captured_at: new Date().toISOString(),
          source: "api",
          views: metrics.views.value,
          reach: metrics.reach.value,
          impressions: null,
          likes: item.like_count == null ? null : Number(item.like_count),
          comments: item.comments_count == null ? null : Number(item.comments_count),
          shares: metrics.shares.value,
          saves: metrics.saved.value,
          reposts: metrics.reposts.value,
          clicks: null,
          followers_gained: null,
          raw_payload: { media: item, insights: metrics },
          created_by: account.user_id,
        });
        if (metricError) throw metricError;
        snapshots += 1;
      }
      const detectedUsername = media.find((item) =>
        typeof item.username === "string" && item.username.trim()
      )?.username;
      await admin
        .from("connected_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          data_source: "meta",
          ...(detectedUsername
            ? {
              username: String(detectedUsername),
              account_name: `@${String(detectedUsername)}`,
            }
            : {}),
        })
        .eq("id", account.id);
      summaries.push({ account_id: account.id, imported, snapshots });
      const reels = media.filter((item) => item.media_product_type === "REELS").length;
      const carousels = media.filter((item) => item.media_type === "CAROUSEL_ALBUM").length;
      const posts = Math.max(0, media.length - reels - carousels);
      const postingTimes = media.map((item) => {
        const value = new Date(String(item.timestamp));
        return new Intl.DateTimeFormat("pt-BR", {
          timeZone: reportTimezone(), hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(value);
      }).sort();
      reportSummaries.push({
        username: String(detectedUsername || account.username || account.account_name || "instagram").replace(/^@/, ""),
        found: media.length, reels, carousels, posts, views, reach, likes, comments, shares, saves, postingTimes,
      });
    }
    let notificationStatus = "disabled";
    if (reportSummaries.length) {
      const messages = reportSummaries.map((item, index) => {
        const times = item.postingTimes as string[];
        return [
          `📍 *PERFIL • ${index + 1}/${reportSummaries.length}*`, "",
          `🟢 *@${String(item.username).toUpperCase()}*`, "",
          `📊 *${item.found} publicações no perfil*`, "",
          `✍️ *Originadas pelo perfil: ${item.found}*`,
          `• Próprias/identificadas pela Meta: ${item.found}`,
          "• Com collab confirmada: 0", "",
          "📥 *Recebidas por collab: não expostas neste endpoint da Meta*", "",
          "📱 *Formatos*",
          `🎬 Reels: ${item.reels}`,
          `🖼️ Posts: ${item.posts}`,
          `🎠 Carrosséis: ${item.carousels}`, "",
          `👁️ Views: ${number(Number(item.views))}`,
          `📣 Alcance: ${number(Number(item.reach))}`,
          `🕐 Horários de postagens: ${times.length ? `(${times.join(", ")})` : "—"}`,
        ].join("\n");
      });
      const totals = reportSummaries.reduce((sum, item) => ({
        found: sum.found + Number(item.found), reels: sum.reels + Number(item.reels),
        posts: sum.posts + Number(item.posts), carousels: sum.carousels + Number(item.carousels),
        views: sum.views + Number(item.views), reach: sum.reach + Number(item.reach),
        likes: sum.likes + Number(item.likes), comments: sum.comments + Number(item.comments),
        shares: sum.shares + Number(item.shares), saves: sum.saves + Number(item.saves),
      }), { found: 0, reels: 0, posts: 0, carousels: 0, views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
      const stamp = localDateTime();
      messages.push([
        "📊 *INSTAGRAM • RESUMO DA REDE*", `📅 ${stamp.date} • Atualização ${stamp.time}`, "",
        "🧾 *PUBLICAÇÕES*", `Publicações encontradas: ${totals.found}`,
        `Reels: ${totals.reels} • Carrosséis: ${totals.carousels} • Posts: ${totals.posts}`, "",
        "👀 *AUDIÊNCIA*", `Views monitoradas: ${number(totals.views)}`, `Alcance: ${number(totals.reach)}`,
        `Curtidas: ${number(totals.likes)} • Comentários: ${number(totals.comments)}`,
        `Compartilhamentos: ${number(totals.shares)} • Salvamentos: ${number(totals.saves)}`, "",
        `Tipo: ${identity.scheduled ? "Automática" : "Manual"}`, "Fonte: Meta — API oficial",
      ].join("\n"));
      notificationStatus = await sendEvolutionMessages(messages);
    }
    return json({
      accounts: summaries,
      imported: summaries.reduce((sum, item) => sum + item.imported, 0),
      notification_status: notificationStatus,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
      ? JSON.stringify(error)
      : String(error || "Unexpected error");
    return json(
      { error: message },
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
    );
  }
});
