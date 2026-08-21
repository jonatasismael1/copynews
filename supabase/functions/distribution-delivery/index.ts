import { createClient } from "jsr:@supabase/supabase-js@2";
import { externalizeStorageUrl } from "../_shared/public-url.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const slug = String(body.slug || "").trim();
    if (!/^[a-z0-9-]{16,180}$/.test(slug))
      return json({ error: "Link inválido" }, 404);
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: delivery } = await admin
      .from("news_send_history")
      .select(
        "id,organization_id,news_id,source_type,direct_payload,recipient_id,source_url,news_title,recipient_name,recipient_vehicle,sender_name,delivery_media_paths,delivery_media_expires_at,created_at,created_by,status,recipient_confirmed_at,confirmed_publication_id,confirmed_publication_ids",
      )
      .eq("share_slug", slug)
      .in("status", ["processing", "success", "partial"])
      .maybeSingle();
    if (!delivery) return json({ error: "Link não encontrado" }, 404);
    let news: Record<string, unknown> | null = null;
    if (delivery.news_id) {
      const result = await admin
        .from("news_items")
        .select(
          "original_title,original_caption,clean_original_caption,source_caption,source_author",
        )
        .eq("id", delivery.news_id)
        .single();
      news = result.data;
    }
    const direct = (delivery.direct_payload || {}) as Record<string, unknown>;
    const rawItems =
      delivery.source_type === "direct_batch" && Array.isArray(direct.items)
        ? (direct.items as Record<string, unknown>[])
        : [
            {
              source_url: delivery.source_url,
              original_title:
                news?.original_title ||
                direct.original_title ||
                delivery.news_title,
              original_caption:
                news?.clean_original_caption ||
                news?.original_caption ||
                news?.source_caption ||
                direct.original_caption,
              delivery_media_paths: delivery.delivery_media_paths || [],
              source_author: news?.source_author || null,
            },
          ];
    const paths = [
      ...new Set(
        rawItems.flatMap((item) =>
          Array.isArray(item.delivery_media_paths)
            ? item.delivery_media_paths.map(String)
            : [],
        ),
      ),
    ];
    const signed = new Map<string, string>();
    if (
      paths.length &&
      (!delivery.delivery_media_expires_at ||
        new Date(delivery.delivery_media_expires_at) > new Date())
    ) {
      const { data } = await admin.storage
        .from("temporary-media")
        .createSignedUrls(paths, 3600, {
          download: "noticia-original-baixada",
        });
      (data || []).forEach((item, index) => {
        if (item.signedUrl)
          signed.set(
            paths[index],
            externalizeStorageUrl(item.signedUrl, new URL(req.url).origin),
          );
      });
    }
    const { data: confirmationRows } = await admin
      .from("news_send_item_confirmations")
      .select("item_position,publication_id,confirmed_at")
      .eq("delivery_id", delivery.id);
    const confirmedByPosition = new Map(
      (confirmationRows || []).map((row) => [row.item_position, row]),
    );
    const legacyAll =
      Boolean(delivery.recipient_confirmed_at) &&
      confirmedByPosition.size === 0;
    const items = rawItems.map((item, index) => {
      const itemPaths = Array.isArray(item.delivery_media_paths)
        ? item.delivery_media_paths.map(String)
        : [];
      const confirmation = confirmedByPosition.get(index + 1);
      return {
        position: index + 1,
        title: String(item.original_title || `Notícia ${index + 1}`),
        caption: String(item.original_caption || ""),
        source_url: String(item.source_url || ""),
        source_author: item.source_author || null,
        media_error: item.media_error || null,
        media: itemPaths
          .filter((path) => signed.has(path))
          .map((path) => ({
            url: signed.get(path),
            name: path.split("/").pop() || "noticia-original-baixada",
            kind: /\.(mp4|mov|webm)$/i.test(path) ? "video" : "image",
          })),
        media_expired:
          itemPaths.length > 0 && !itemPaths.some((path) => signed.has(path)),
        confirmed_at:
          confirmation?.confirmed_at ||
          (legacyAll ? delivery.recipient_confirmed_at : null),
      };
    });
    if (body.action === "confirm_published") {
      let positions: number[];
      if (body.item_position !== undefined) {
        const position = Number(body.item_position);
        if (
          !Number.isInteger(position) ||
          position < 1 ||
          position > items.length
        )
          return json({ error: "Notícia inválida" }, 400);
        positions = [position];
      } else positions = items.map((item) => item.position);
      let creatorId = delivery.created_by;
      if (!creatorId) {
        const { data: fallback } = await admin
          .from("profiles")
          .select("id")
          .eq("organization_id", delivery.organization_id)
          .eq("is_active", true)
          .order("created_at")
          .limit(1)
          .single();
        creatorId = fallback?.id;
      }
      if (!creatorId)
        throw new Error("Responsável pela entrega não encontrado");
      const { data: recipient } = delivery.recipient_id
        ? await admin
            .from("distribution_recipients")
            .select("profile_id")
            .eq("id", delivery.recipient_id)
            .maybeSingle()
        : { data: null };
      for (const position of positions) {
        if (confirmedByPosition.has(position) || legacyAll) continue;
        const item = items[position - 1];
        const { data: publication, error } = await admin
          .from("publications")
          .insert({
            news_item_id: items.length === 1 ? delivery.news_id || null : null,
            title: item.title,
            caption: item.caption || null,
            platform: "Confirmação do destinatário",
            published_url: "",
            published_at: new Date().toISOString(),
            posted_by: recipient?.profile_id || null,
            source_type: "copy_news",
            created_by: creatorId,
            confirmed_recipient_id: delivery.recipient_id,
            confirmed_recipient_name: delivery.recipient_name,
            notes: `Publicação ${position} confirmada pelo destinatário ${delivery.recipient_name}`,
          })
          .select("id")
          .single();
        if (error) throw error;
        const confirmedAt = new Date().toISOString();
        const { error: confirmationError } = await admin
          .from("news_send_item_confirmations")
          .insert({
            delivery_id: delivery.id,
            item_position: position,
            publication_id: publication.id,
            recipient_id: delivery.recipient_id,
            profile_id: recipient?.profile_id || null,
            confirmed_at: confirmedAt,
          });
        if (confirmationError) throw confirmationError;
        confirmedByPosition.set(position, {
          item_position: position,
          publication_id: publication.id,
          confirmed_at: confirmedAt,
        });
      }
      if (delivery.news_id && confirmedByPosition.has(1))
        await admin
          .from("news_items")
          .update({ status: "published" })
          .eq("id", delivery.news_id);
      const allConfirmed =
        legacyAll || confirmedByPosition.size >= items.length;
      const confirmedAt = allConfirmed
        ? delivery.recipient_confirmed_at || new Date().toISOString()
        : null;
      const publicationIds = [...confirmedByPosition.values()]
        .sort((a, b) => a.item_position - b.item_position)
        .map((row) => row.publication_id);
      await admin
        .from("news_send_history")
        .update({
          recipient_confirmed_at: confirmedAt,
          confirmed_by_recipient_name: allConfirmed
            ? delivery.recipient_name
            : null,
          confirmed_publication_id: publicationIds[0] || null,
          confirmed_publication_ids: publicationIds,
        })
        .eq("id", delivery.id);
      return json({
        confirmed: true,
        all_confirmed: allConfirmed,
        confirmed_at: confirmedAt,
        confirmed_positions: [...confirmedByPosition.keys()].sort(
          (a, b) => a - b,
        ),
        publication_count: publicationIds.length,
      });
    }
    return json({
      title: items.length === 1 ? items[0].title : `${items.length} notícias`,
      caption: items.length === 1 ? items[0].caption : "",
      source_url: items[0].source_url,
      sender_name: delivery.sender_name || "Copy News",
      recipient_name: delivery.recipient_name,
      recipient_vehicle: delivery.recipient_vehicle,
      created_at: delivery.created_at,
      items,
      is_batch: items.length > 1,
      recipient_confirmed_at: delivery.recipient_confirmed_at,
      confirmed_count: items.filter((item) => item.confirmed_at).length,
    });
  } catch (error) {
    console.error(
      "distribution-delivery.failed",
      error instanceof Error ? error.message : JSON.stringify(error),
    );
    return json({ error: "Não foi possível abrir esta entrega" }, 400);
  }
});
