export const supabaseUrl = "https://bfrhtnwgzhcubfrvrylf.supabase.co";
export const publishableKey = "sb_publishable_HZNBxkBFePGeE3PQ8rUsog_ocz-wR5g";

export const cors = {
  "Access-Control-Allow-Origin": "https://copynews.netlify.app",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: { ...cors, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function settingsRedirect(params) {
  const url = new URL("https://copynews.netlify.app/configuracoes");
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  return { statusCode: 302, headers: { Location: url.toString() }, body: "" };
}
