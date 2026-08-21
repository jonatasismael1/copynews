const json = (statusCode, message) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ error: message }),
});

export async function handler(event) {
  const expected = process.env.INSTAGRAM_MEDIA_PROXY_KEY || "";
  const received = event.headers?.["x-copynews-key"] || "";
  if (!expected || received !== expected) return json(401, "unauthorized");

  const shortcode = String(event.queryStringParameters?.shortcode || "");
  if (!/^[A-Za-z0-9_-]{5,24}$/.test(shortcode))
    return json(400, "invalid_shortcode");

  const source = `https://www.instagram.com/p/${shortcode}/media/?size=l`;
  try {
    const response = await fetch(source, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/"))
      return json(502, "instagram_media_unavailable");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 15 * 1024 * 1024)
      return json(502, "invalid_media");
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
      body: bytes.toString("base64"),
    };
  } catch {
    return json(502, "instagram_media_unavailable");
  }
}
