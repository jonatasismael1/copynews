const jsonHeaders = {
  "content-type": "application/json",
  accept: "application/json",
};

export async function acquireMedia(sourceUrl, { cobaltUrl, cobaltKey }) {
  const endpoint = cobaltUrl.replace(/\/$/, "");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      ...(cobaltKey ? { Authorization: `Api-Key ${cobaltKey}` } : {}),
    },
    body: JSON.stringify({
      url: sourceUrl,
      downloadMode: "auto",
      videoQuality: "1080",
      filenameStyle: "basic",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === "error")
    throw Object.assign(
      new Error(
        payload.error?.code ||
          payload.text ||
          `Cobalt HTTP ${response.status}`,
      ),
      { code: "COBALT_ERROR" },
    );
  let mediaItems = [];
  if (["redirect", "tunnel"].includes(payload.status))
    mediaItems = [
      {
        url: payload.url,
        type: payload.type || "unknown",
        filename: payload.filename || "source",
      },
    ];
  else if (payload.status === "picker")
    mediaItems = (payload.picker || [])
      .filter((item) => item.url)
      .map((item, index) => ({
        url: item.url,
        type: item.type || "unknown",
        filename: item.filename || `carousel-${index + 1}`,
      }));
  if (!mediaItems.length)
    throw Object.assign(
      new Error("Cobalt não retornou uma mídia compatível"),
      { code: "COBALT_EMPTY" },
    );
  if (payload.status === "tunnel") {
    mediaItems = mediaItems.map((item) => {
      const tunnel = new URL(item.url);
      const configured = new URL(endpoint);
      tunnel.protocol = configured.protocol;
      tunnel.host = configured.host;
      return { ...item, url: tunnel.toString() };
    });
  }
  return {
    mediaUrl: mediaItems[0].url,
    mediaItems,
    filename: payload.filename || mediaItems[0].filename || "source",
    cobaltStatus: payload.status,
  };
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&([a-z]+);/gi, (entity, name) => named[name] ?? entity);
}

function metaContent(html, key, value) {
  const tag = html
    .match(/<meta\b[^>]*>/gi)
    ?.find((candidate) => {
      const attributes = Object.fromEntries(
        [...candidate.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(
          (match) => [match[1].toLowerCase(), match[3]],
        ),
      );
      return attributes[key] === value;
    });
  if (!tag) return null;
  const content = tag.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  return content ? decodeHtml(content).trim() : null;
}

export function parseInstagramMetadata(html) {
  const ogTitle = metaContent(html, "property", "og:title");
  const description = metaContent(html, "name", "description");
  const twitterTitle = metaContent(html, "name", "twitter:title");
  let caption = null;

  if (ogTitle) {
    const marker = ' no Instagram: "';
    const start = ogTitle.indexOf(marker);
    if (start >= 0 && ogTitle.endsWith('"'))
      caption = ogTitle.slice(start + marker.length, -1).trim();
  }
  if (!caption && description) {
    const start = description.lastIndexOf(': "');
    if (start >= 0)
      caption = description
        .slice(start + 3)
        .replace(/"\.?\s*$/, "")
        .trim();
  }

  const author =
    twitterTitle?.match(/\(@([^)]+)\)/)?.[1] ||
    description?.match(/-\s+([^\s]+)\s+no\s+/)?.[1] ||
    null;
  return { caption, author, provider: caption ? "instagram-meta" : "none" };
}

async function instagramMetadata(sourceUrl) {
  const url = new URL(sourceUrl);
  url.search = "?__a=1";
  url.hash = "";
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Instagram 219.0.0.12.117 Android",
      "X-IG-App-ID": "936619743392459",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { caption: null, author: null, provider: "none" };
  return parseInstagramMetadata(await response.text());
}

export async function extractMetadata(sourceUrl) {
  const url = new URL(sourceUrl);
  try {
    if (url.hostname.includes("tiktok")) {
      const response = await fetch(
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(sourceUrl)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (response.ok) {
        const payload = await response.json();
        return {
          caption: payload.title || null,
          author: payload.author_name || null,
          provider: "tiktok-oembed",
        };
      }
    }
    if (url.hostname.includes("instagram"))
      return await instagramMetadata(sourceUrl);
  } catch (error) {
    console.warn(
      JSON.stringify({ event: "metadata.failed", message: error.message }),
    );
  }
  return { caption: null, author: null, provider: "none" };
}
