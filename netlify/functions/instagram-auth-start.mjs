import {
  cors,
  json,
  publishableKey,
  supabaseUrl,
} from "./_shared/instagram-oauth.mjs";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = event.headers.authorization || event.headers.Authorization;
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/instagram-oauth`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        apikey: publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "start",
        page_id: JSON.parse(event.body || "{}").page_id,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = await response.json();
    return json(
      response.ok ? payload : { error: payload.error || "Não foi possível iniciar o login" },
      response.status,
    );
  } catch {
    return json({ error: "Não foi possível iniciar o login do Instagram" }, 500);
  }
}
