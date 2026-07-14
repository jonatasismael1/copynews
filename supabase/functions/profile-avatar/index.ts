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

function isValidImage(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (type === "image/png")
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (type === "image/webp")
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF";
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization) throw new Error("Unauthorized");
    const authClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error,
    } = await authClient.auth.getUser();
    if (error || !user) throw new Error("Unauthorized");
    const admin = createClient(
      env("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const { data: profile } = await admin
      .from("profiles")
      .select("avatar_url,is_active")
      .eq("id", user.id)
      .single();
    if (!profile?.is_active) throw new Error("Forbidden");

    const { data_url: dataUrl } = await req.json();
    const match = String(dataUrl || "").match(
      /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i,
    );
    if (!match) throw new Error("Imagem inválida");
    const type = match[1].toLowerCase();
    const binary = atob(match[2]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > 2_097_152)
      throw new Error("A foto deve ter no máximo 2 MB");
    if (!isValidImage(bytes, type)) throw new Error("Formato de imagem inválido");

    const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1];
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await admin.storage
      .from("profile-avatars")
      .upload(path, bytes, { contentType: type, cacheControl: "31536000" });
    if (uploaded.error) throw uploaded.error;
    const { data: publicUrl } = admin.storage
      .from("profile-avatars")
      .getPublicUrl(path);
    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_url: publicUrl.publicUrl })
      .eq("id", user.id);
    if (updateError) {
      await admin.storage.from("profile-avatars").remove([path]);
      throw updateError;
    }

    const marker = "/storage/v1/object/public/profile-avatars/";
    const oldPath = profile.avatar_url?.includes(marker)
      ? decodeURIComponent(profile.avatar_url.split(marker)[1])
      : null;
    if (oldPath) await admin.storage.from("profile-avatars").remove([oldPath]);
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "profile.avatar.updated",
      entity_type: "profile",
      entity_id: user.id,
    });
    return json({ avatar_url: publicUrl.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return json({ error: message }, status);
  }
});
