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
    const code = typeof query.code === "string" ? query.code : "";
    const state = typeof query.state === "string" ? query.state : "";
    const providerError = typeof query.error === "string" ? query.error : "";
    console.info(JSON.stringify({
      event: "callback_received",
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasError: Boolean(providerError),
    }));
    if (!code)
      return settingsRedirect({ instagram: "error", reason: "missing_code" });
    const response = await fetch(`${supabaseUrl}/functions/v1/instagram-oauth`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "callback",
        code,
        state,
        error: providerError,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    const safeStages = new Set([
      "state_validated",
      "token_exchanged",
      "profile_loaded",
      "account_saved",
      "callback_completed",
    ]);
    for (const stage of payload.completed_stages || []) {
      if (safeStages.has(stage)) console.info(JSON.stringify({ event: stage }));
    }
    if (!response.ok || !payload.redirect_url) {
      console.error(JSON.stringify({
        event: "callback_failed",
        stage: "backend",
        status: response.status,
        reason: payload.reason || "connection_failed",
        completedStages: payload.completed_stages || [],
      }));
      return settingsRedirect({ instagram: "error", reason: payload.reason || "connection_failed" });
    }
    return { statusCode: 302, headers: { Location: payload.redirect_url }, body: "" };
  } catch (error) {
    console.error(JSON.stringify({
      event: "callback_failed",
      stage: "proxy",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return settingsRedirect({ instagram: "error", reason: "connection_failed" });
  }
}
