import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function failure(code: string, message: string, status = 400): never {
  throw Object.assign(new Error(message), { code, status });
}

async function fingerprint(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signedUrl(
  admin: ReturnType<typeof createClient>,
  path: string,
) {
  const { data, error } = await admin.storage
    .from("news-designs")
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl)
    failure("STORAGE_SIGN_FAILED", "Não foi possível abrir a mídia preparada.");
  return data.signedUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return response({ error: "Método não permitido", code: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) failure("UNAUTHORIZED", "Sessão inválida.", 401);

    const url = env("SUPABASE_URL");
    const userClient = createClient(url, env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) failure("UNAUTHORIZED", "Sessão inválida.", 401);

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("organization_id,is_active")
      .eq("id", user.id)
      .single();
    if (profileError || !profile?.is_active)
      failure("FORBIDDEN", "Usuário sem acesso ao editor.", 403);

    const { news_item_id } = await req.json();
    if (!news_item_id)
      failure("NEWS_ID_REQUIRED", "Notícia não informada.");

    const { data: news, error: newsError } = await userClient
      .from("news_items")
      .select("id,temporary_media_path,temporary_media_paths")
      .eq("id", news_item_id)
      .single();
    if (newsError || !news)
      failure("NEWS_NOT_FOUND", "Notícia não encontrada.", 404);

    const { data: design } = await userClient
      .from("news_designs")
      .select("id,media_asset_path,media_mime_type")
      .eq("news_id", news.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const sourcePaths = news.temporary_media_paths?.length
      ? news.temporary_media_paths
      : news.temporary_media_path
        ? [news.temporary_media_path]
        : [];

    if (!sourcePaths.length && design?.media_asset_path) {
      return response({
        url: await signedUrl(admin, design.media_asset_path),
        path: design.media_asset_path,
        mime_type: design.media_mime_type || "image/jpeg",
        source: "saved",
      });
    }
    if (!sourcePaths.length)
      failure("MEDIA_URL_MISSING", "Esta notícia não possui mídia disponível.");

    const sourcePath = sourcePaths[0];
    const sourceId = await fingerprint(sourcePath);
    const folder = `${profile.organization_id}/${news.id}/source`;
    const { data: preparedFiles } = await admin.storage
      .from("news-designs")
      .list(folder, { limit: 10, search: `source-${sourceId}.` });
    const prepared = preparedFiles?.find((file) =>
      file.name.startsWith(`source-${sourceId}.`)
    );

    if (prepared) {
      const path = `${folder}/${prepared.name}`;
      const mimeType =
        prepared.metadata?.mimetype ||
        Object.entries(extensions).find(([, extension]) =>
          prepared.name.endsWith(`.${extension}`)
        )?.[0] ||
        "application/octet-stream";
      if (design?.id && design.media_asset_path !== path) {
        await userClient
          .from("news_designs")
          .update({ media_asset_path: path, media_mime_type: mimeType })
          .eq("id", design.id);
      }
      return response({
        url: await signedUrl(admin, path),
        path,
        mime_type: mimeType,
        source: "prepared",
      });
    }

    const { data: blob, error: downloadError } = await admin.storage
      .from("temporary-media")
      .download(sourcePath, {}, { cache: "no-store" });
    if (downloadError || !blob) {
      console.error(
        JSON.stringify({
          code: "SOURCE_UNAVAILABLE",
          news_item_id,
          sourcePath,
          message: downloadError?.message,
        }),
      );
      failure(
        "SOURCE_UNAVAILABLE",
        "A mídia original expirou ou não está mais disponível.",
        410,
      );
    }

    const mimeType = blob.type.split(";")[0].toLowerCase();
    if (!allowedMimeTypes.has(mimeType))
      failure(
        "UNSUPPORTED_FORMAT",
        `O formato ${mimeType || "desconhecido"} não é compatível com o editor.`,
        415,
      );
    const sizeLimit = mimeType.startsWith("video/")
      ? 100 * 1024 * 1024
      : 15 * 1024 * 1024;
    if (blob.size > sizeLimit)
      failure(
        "FILE_TOO_LARGE",
        `A mídia ultrapassa o limite de ${mimeType.startsWith("video/") ? 100 : 15} MB.`,
        413,
      );

    const destinationPath =
      `${folder}/source-${sourceId}.${extensions[mimeType]}`;
    const { error: uploadError } = await admin.storage
      .from("news-designs")
      .upload(destinationPath, blob, {
        contentType: mimeType,
        cacheControl: "31536000",
        upsert: true,
      });
    if (uploadError) {
      console.error(
        JSON.stringify({
          code: "STORAGE_UPLOAD_FAILED",
          news_item_id,
          destinationPath,
          message: uploadError.message,
        }),
      );
      failure(
        "STORAGE_UPLOAD_FAILED",
        "Não foi possível preparar a mídia no Storage.",
        500,
      );
    }

    if (design?.id) {
      const { error: updateError } = await userClient
        .from("news_designs")
        .update({
          media_asset_path: destinationPath,
          media_mime_type: mimeType,
        })
        .eq("id", design.id);
      if (updateError)
        console.error(
          JSON.stringify({
            code: "DESIGN_ASSOCIATION_FAILED",
            designId: design.id,
            message: updateError.message,
          }),
        );
    }

    return response({
      url: await signedUrl(admin, destinationPath),
      path: destinationPath,
      mime_type: mimeType,
      source: "normalized",
    });
  } catch (error) {
    const detail = error as Error & { code?: string; status?: number };
    console.error(
      JSON.stringify({
        code: detail.code || "PREPARE_MEDIA_FAILED",
        message: detail.message,
      }),
    );
    return response(
      {
        error: detail.message || "Não foi possível preparar a mídia.",
        code: detail.code || "PREPARE_MEDIA_FAILED",
      },
      detail.status || 400,
    );
  }
});
