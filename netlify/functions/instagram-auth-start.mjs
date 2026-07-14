import {
  cors,
  json,
  publishableKey,
  supabaseUrl,
} from "./_shared/instagram-oauth.mjs";

const expectedRedirectUri = "https://copynews.netlify.app/auth/instagram/callback";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 204, headers: cors, body: "" };
  if (event.httpMethod !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = event.headers.authorization || event.headers.Authorization;
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  try {
    console.info(JSON.stringify({ event: "oauth_start_called" }));
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
    if (response.ok && payload.authorization_url) {
      const authorizationUrl = new URL(payload.authorization_url);
      if (authorizationUrl.searchParams.get("redirect_uri") !== expectedRedirectUri)
        return json({ error: "Redirect URI invalida" }, 500);
      console.info(JSON.stringify({ event: "oauth_url_created" }));
    }
    return json(
      response.ok ? payload : { error: payload.error || "Nao foi possivel iniciar o login" },
      response.status,
    );
  } catch {
    return json({ error: "Nao foi possivel iniciar o login do Instagram" }, 500);
  }
}
