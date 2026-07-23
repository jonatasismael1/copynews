const jsonHeaders = {
  "content-type": "application/json",
  accept: "application/json",
};

export function isInstagramReelUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.includes("instagram.com") &&
      /^\/reels?\//i.test(url.pathname);
  } catch {
    return false;
  }
}

export function isYouTubeUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith(".youtube.com") ||
      host === "youtube.com";
  } catch {
    return false;
  }
}

export function isVideoMediaItem(item) {
  const value = `${item?.type || ""} ${item?.filename || ""}`.toLowerCase();
  return /\bvideo\b/.test(value) || /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(value);
}

export function selectDownloadableMedia(items) {
  return items.find((item) => item.auditOnly !== true);
}

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

function tagText(html, expression) {
  const match = html.match(expression);
  if (!match?.[1]) return null;
  return decodeHtml(
    match[1]
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeFilename(url, fallback) {
  try {
    return new URL(url).pathname.split("/").pop() || fallback;
  } catch {
    return fallback;
  }
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
  const image =
    metaContent(html, "property", "og:image") ||
    metaContent(html, "name", "twitter:image");
  return {
    caption,
    author,
    provider: caption || image ? "instagram-meta" : "none",
    ...(image
      ? {
          mediaItems: [
            {
              url: image,
              type: "image",
              filename: safeFilename(image, "instagram-preview.jpg"),
            },
          ],
        }
      : {}),
  };
}

export function parseInstagramEmbedImage(html) {
  const normalized = decodeHtml(
    html.replace(/\\u0026/g, "&").replace(/\\\//g, "/"),
  );
  const candidates = [
    ...new Set(normalized.match(/https:\/\/scontent[^"'<>\\\s]+/g) || []),
  ].filter((candidate) => {
    try {
      const stp = new URL(candidate).searchParams.get("stp") || "";
      return !/^c\d/.test(stp) && !/s100x100/.test(stp);
    } catch {
      return false;
    }
  });
  const original = candidates.find((candidate) => {
    const stp = new URL(candidate).searchParams.get("stp") || "";
    return /dst-jpg_e\d+_tt\d+$/.test(stp);
  });
  return original || candidates.find((candidate) => /p1080x1080/.test(candidate)) || null;
}

export function parseArticleMetadata(html, sourceUrl) {
  const title =
    metaContent(html, "property", "og:title") ||
    tagText(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    tagText(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    metaContent(html, "property", "og:description") ||
    metaContent(html, "name", "description");
  const article =
    tagText(
      html,
      /<main\b[^>]*class=["'][^"']*(?:article|post|news)[^"']*["'][^>]*>([\s\S]*?)<\/main>/i,
    ) ||
    tagText(html, /<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const image =
    metaContent(html, "property", "og:image") ||
    metaContent(html, "name", "twitter:image");
  const author =
    tagText(
      html,
      /<[^>]+class=["'][^"']*(?:author|source-date)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    ) || metaContent(html, "name", "author");
  const publishedAt =
    metaContent(html, "property", "article:published_time") ||
    html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] ||
    null;
  const parts = [description, article]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  const caption = (description || title || "").slice(0, 8_000) || null;
  const articleBody = (article || parts.join("\n\n")).slice(0, 24_000) || null;
  return {
    caption,
    articleBody,
    title: title || null,
    author: author || new URL(sourceUrl).hostname,
    publishedAt,
    provider: caption || image ? "web-article" : "none",
    ...(image
      ? {
          mediaItems: [
            {
              url: image,
              type: "image",
              filename: safeFilename(image, "article-image.jpg"),
            },
          ],
        }
      : {}),
  };
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
  const metadata = parseInstagramMetadata(await response.text());
  try {
    const embedUrl = new URL(url);
    embedUrl.search = "";
    embedUrl.pathname = `${embedUrl.pathname.replace(/\/?$/, "/")}embed/`;
    const embedResponse = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; CopyNewsBot/1.0; +https://copynews.netlify.app)",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const fullImage = embedResponse.ok
      ? parseInstagramEmbedImage(await embedResponse.text())
      : null;
    if (fullImage)
      metadata.mediaItems = [
        {
          url: fullImage,
          type: "image",
          filename: safeFilename(fullImage, "instagram-original.jpg"),
        },
      ];
  } catch (error) {
    console.warn(
      JSON.stringify({ event: "instagram.embed.failed", message: error.message }),
    );
  }
  return metadata;
}

export async function extractMetadata(sourceUrl) {
  const url = new URL(sourceUrl);
  try {
    if (isYouTubeUrl(sourceUrl)) {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(sourceUrl)}&format=json`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (response.ok) {
        const payload = await response.json();
        return {
          title: payload.title || null,
          caption: payload.title || null,
          author: payload.author_name || null,
          provider: "youtube-oembed",
          mediaItems: payload.thumbnail_url
            ? [{
                url: payload.thumbnail_url,
                type: "image",
                filename: "youtube-thumbnail.jpg",
                auditOnly: true,
              }]
            : [],
        };
      }
    }
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
    if (["http:", "https:"].includes(url.protocol)) {
      const response = await fetch(sourceUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; CopyNewsBot/1.0; +https://copynews.netlify.app)",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok)
        return parseArticleMetadata(await response.text(), response.url || sourceUrl);
    }
  } catch (error) {
    console.warn(
      JSON.stringify({ event: "metadata.failed", message: error.message }),
    );
  }
  return { caption: null, author: null, provider: "none" };
}
