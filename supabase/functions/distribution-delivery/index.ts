import { createClient } from "jsr:@supabase/supabase-js@2";
import { externalizeStorageUrl } from "../_shared/public-url.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Missing ${name}`); return value; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const slug = String(body.slug || "").trim();
    if (!/^[a-z0-9-]{16,180}$/.test(slug)) return json({ error: "Link inválido" }, 404);
    const admin = createClient(env("SUPABASE_URL"), Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: delivery } = await admin.from("news_send_history").select("id,organization_id,news_id,direct_payload,recipient_id,source_url,news_title,recipient_name,recipient_vehicle,sender_name,delivery_media_paths,delivery_media_expires_at,created_at,created_by,status,recipient_confirmed_at,confirmed_publication_id").eq("share_slug", slug).in("status", ["processing", "success"]).maybeSingle();
    if (!delivery) return json({ error: "Link não encontrado" }, 404);
    let news: Record<string, unknown> | null = null;
    if (delivery.news_id) {
      const result = await admin.from("news_items").select("original_title,original_caption,clean_original_caption,source_caption,source_author").eq("id", delivery.news_id).single();
      news = result.data;
    }
    const direct = (delivery.direct_payload || {}) as Record<string, unknown>;
    const title = String(news?.original_title || direct.original_title || delivery.news_title || "Notícia");
    const caption = String(news?.clean_original_caption || news?.original_caption || news?.source_caption || direct.original_caption || "");
    if (body.action === "confirm_published") {
      if (delivery.recipient_confirmed_at) return json({ confirmed: true, confirmed_at: delivery.recipient_confirmed_at });
      let publicationId: string | null = null;
      if (delivery.news_id) {
        const { data: existing } = await admin.from("publications").select("id").eq("news_item_id", delivery.news_id).eq("published_url", "").is("archived_at", null).maybeSingle();
        publicationId = existing?.id || null;
      }
      if (!publicationId) {
        let creatorId = delivery.created_by;
        if (!creatorId) {
          const { data: fallback } = await admin.from("profiles").select("id").eq("organization_id", delivery.organization_id).eq("is_active", true).order("created_at").limit(1).single();
          creatorId = fallback?.id;
        }
        if (!creatorId) throw new Error("Responsável pela entrega não encontrado");
        const { data: publication, error: publicationError } = await admin.from("publications").insert({ news_item_id: delivery.news_id || null, title, caption: caption || null, platform: "Confirmação do destinatário", published_url: "", published_at: new Date().toISOString(), posted_by: null, source_type: delivery.news_id ? "copy_news" : "external", created_by: creatorId, confirmed_recipient_id: delivery.recipient_id, confirmed_recipient_name: delivery.recipient_name, notes: `Publicação confirmada pelo destinatário ${delivery.recipient_name}` }).select("id").single();
        if (publicationError) throw publicationError;
        publicationId = publication.id;
      } else {
        await admin.from("publications").update({ confirmed_recipient_id: delivery.recipient_id, confirmed_recipient_name: delivery.recipient_name, published_at: new Date().toISOString() }).eq("id", publicationId);
      }
      if (delivery.news_id) await admin.from("news_items").update({ status: "published" }).eq("id", delivery.news_id);
      const confirmedAt = new Date().toISOString();
      const { error: confirmationError } = await admin.from("news_send_history").update({ recipient_confirmed_at: confirmedAt, confirmed_by_recipient_name: delivery.recipient_name, confirmed_publication_id: publicationId }).eq("id", delivery.id).is("recipient_confirmed_at", null);
      if (confirmationError) throw confirmationError;
      return json({ confirmed: true, confirmed_at: confirmedAt });
    }
    const paths = delivery.delivery_media_paths || [];
    let media: { url: string; name: string; kind: string }[] = [];
    if (paths.length && (!delivery.delivery_media_expires_at || new Date(delivery.delivery_media_expires_at) > new Date())) {
      const { data } = await admin.storage.from("temporary-media").createSignedUrls(paths, 3600, { download: "noticia-original-baixada" });
      media = (data || []).filter((item) => item.signedUrl).map((item, index) => ({ url: externalizeStorageUrl(item.signedUrl, new URL(req.url).origin), name: paths[index]?.split("/").pop() || `noticia-original-baixada-${index + 1}`, kind: /\.(mp4|mov|webm)$/i.test(paths[index] || "") ? "video" : "image" }));
    }
    return json({ title, caption, source_url: delivery.source_url, source_author: news?.source_author || null, sender_name: delivery.sender_name || "Copy News", recipient_name: delivery.recipient_name, recipient_vehicle: delivery.recipient_vehicle, created_at: delivery.created_at, media, media_expired: paths.length > 0 && media.length === 0, recipient_confirmed_at: delivery.recipient_confirmed_at });
  } catch (error) {
    console.error("distribution-delivery.failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Não foi possível abrir esta entrega" }, 400);
  }
});
