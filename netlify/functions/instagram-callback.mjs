import {
  publishableKey,
  settingsRedirect,
  supabaseUrl,
} from "./_shared/instagram-oauth.mjs";

export async function handler(event) {
  if (event.httpMethod !== "GET")
    return { statusCode: 405, headers: { Allow: "GET" }, body: "Method not allowed" };
  try {
    const query = event.queryStringParameters || {};
    console.info(JSON.stringify({
      event: "instagram_callback_received",
      hasCode: Boolean(query.code),
      hasState: Boolean(query.state),
      providerError: query.error || null,
    }));
    const response = await fetch(`${supabaseUrl}/functions/v1/instagram-oauth`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "callback",
        code: query.code,
        state: query.state,
        error: query.error,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    if (!response.ok || !payload.redirect_url) {
      console.error(JSON.stringify({
        event: "instagram_callback_rejected",
        status: response.status,
        reason: payload.reason || "connection_failed",
      }));
      return settingsRedirect({ instagram: "error", reason: payload.reason || "connection_failed" });
    }
    return { statusCode: 302, headers: { Location: payload.redirect_url }, body: "" };
  } catch (error) {
    console.error(JSON.stringify({
      event: "instagram_callback_failed",
      reason: error instanceof Error ? error.message : "connection_failed",
    }));
    return settingsRedirect({ instagram: "error", reason: "connection_failed" });
  }
}
