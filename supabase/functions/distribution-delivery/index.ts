import { createClient } from "jsr:@supabase/supabase-js@2";
import { externalizeStorageUrl } from "../_shared/public-url.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const slug = String((await req.json()).slug || "").trim();
    if (!/^[a-z0-9-]{16,180}$/.test(slug)) return json({ error: "Link inválido" }, 404);
    const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: delivery } = await admin.from("news_send_history").select("news_id,direct_payload,source_url,news_title,recipient_name,recipient_vehicle,sender_name,delivery_media_paths,delivery_media_expires_at,created_at,status").eq("share_slug", slug).in("status", ["processing", "success"]).maybeSingle();
    if (!delivery) return json({ error: "Link não encontrado" }, 404);
    let news: Record<string, unknown> | null = null;
    if (delivery.news_id) {
      const result = await admin.from("news_items").select("original_title,original_caption,clean_original_caption,source_caption,source_author").eq("id", delivery.news_id).single();
      news = result.data;
    }
    const direct = (delivery.direct_payload || {}) as Record<string, unknown>;
    const title = String(news?.original_title || direct.original_title || delivery.news_title || "Notícia");
    const caption = String(news?.clean_original_caption || news?.original_caption || news?.source_caption || direct.original_caption || "");
    const paths = delivery.delivery_media_paths || [];
    let media: { url: string; name: string; kind: string }[] = [];
    if (paths.length && (!delivery.delivery_media_expires_at || new Date(delivery.delivery_media_expires_at) > new Date())) {
      const { data } = await admin.storage.from("temporary-media").createSignedUrls(paths, 3600, { download: "noticia-original-baixada" });
      media = (data || []).filter((item) => item.signedUrl).map((item, index) => ({ url: externalizeStorageUrl(item.signedUrl, new URL(req.url).origin), name: paths[index]?.split("/").pop() || `noticia-original-baixada-${index + 1}`, kind: /\.(mp4|mov|webm)$/i.test(paths[index] || "") ? "video" : "image" }));
    }
    return json({ title, caption, source_url: delivery.source_url, source_author: news?.source_author || null, sender_name: delivery.sender_name || "Copy News", recipient_name: delivery.recipient_name, recipient_vehicle: delivery.recipient_vehicle, created_at: delivery.created_at, media, media_expired: paths.length > 0 && media.length === 0 });
  } catch { return json({ error: "Não foi possível abrir esta entrega" }, 400); }
});
