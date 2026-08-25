export type PublicationMetadata = {
  platform: string;
  title: string;
  caption: string | null;
  author: string | null;
  published_at: string;
  thumbnail_url: string | null;
  external_media_id: string | null;
  provider: string;
};

const instagramHeaders = {
  "User-Agent": "Instagram 219.0.0.12.117 Android",
  "X-IG-App-ID": "936619743392459",
  "Accept-Language": "pt-BR,pt;q=0.9",
};

function decodeHtml(value: string) {
  const named: Record<string, string> = {
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

function meta(html: string, key: string, value: string) {
  const tag = html.match(/<meta\b[^>]*>/gi)?.find((candidate) => {
    const attributes = Object.fromEntries(
      [...candidate.matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(
        (match) => [match[1].toLowerCase(), match[3]],
      ),
    );
    return attributes[key] === value;
  });
  const content = tag?.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  return content ? decodeHtml(content).trim() : null;
}

function jsonLdValues(html: string) {
  const values: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(decodeHtml(match[1]));
      values.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch {
      // Invalid third-party JSON-LD is ignored.
    }
  }
  return values;
}

function cleanInstagramTitle(value: string | null) {
  if (!value) return { caption: null, accountName: null };
  const marker = ' no Instagram: "';
  const start = value.indexOf(marker);
  if (start < 0 || !value.endsWith('"'))
    return { caption: null, accountName: null };
  return {
    accountName: value.slice(0, start).trim() || null,
    caption: value.slice(start + marker.length, -1).trim() || null,
  };
}

function firstMeaningfulLine(value: string | null, fallback: string) {
  const first = value
    ?.split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return fallback;
  return first.length > 120 ? `${first.slice(0, 117).trim()}...` : first;
}

function instagramShortcode(url: URL) {
  return url.pathname.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/i)?.[1] ?? null;
}

function instagramDate(shortcode: string | null) {
  if (!shortcode) return null;
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = 0n;
  for (const character of shortcode) {
    const index = alphabet.indexOf(character);
    if (index < 0) return null;
    id = id * 64n + BigInt(index);
  }
  const milliseconds = Number((id >> 23n) + 1314220021721n);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tiktokId(url: URL) {
  return url.pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
}

function tiktokDate(id: string | null) {
  if (!id) return null;
  const seconds = Number(BigInt(id) >> 32n);
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function platform(hostname: string) {
  if (hostname.includes("instagram")) return "Instagram";
  if (hostname.includes("tiktok")) return "TikTok";
  if (hostname.includes("youtu")) return "YouTube";
  if (hostname.includes("facebook") || hostname.includes("fb."))
    return "Facebook";
  return "Web";
}

function validPublicUrl(raw: string) {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname) ||
    url.hostname.endsWith(".local")
  )
    throw new Error("URL inválida");
  return url;
}

export async function inspectPublicationUrl(raw: string) {
  const url = validPublicUrl(raw);
  const isInstagram = url.hostname.includes("instagram");
  const response = await fetch(
    isInstagram
      ? `${url.origin}${url.pathname.replace(/\/$/, "")}/?__a=1`
      : url.toString(),
    {
      headers: isInstagram
        ? instagramHeaders
        : {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/135 Safari/537.36",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok)
    throw new Error(`Não foi possível ler a publicação (${response.status})`);
  const html = await response.text();
  const ogTitle = meta(html, "property", "og:title");
  const description =
    meta(html, "property", "og:description") ||
    meta(html, "name", "description");
  const thumbnail = meta(html, "property", "og:image");
  const ld = jsonLdValues(html);
  const ldItem = ld.find((item) =>
    item.datePublished || item.uploadDate || item.dateCreated,
  );
  let caption = description;
  let author =
    typeof ldItem?.author === "object" && ldItem?.author
      ? String((ldItem.author as Record<string, unknown>).name || "") || null
      : null;
  let title: string;
  let publishedAt =
    meta(html, "property", "article:published_time") ||
    String(
      ldItem?.datePublished || ldItem?.uploadDate || ldItem?.dateCreated || "",
    ) ||
    null;
  let externalId: string | null = null;
  let provider = "open-graph";

  if (isInstagram) {
    const parsed = cleanInstagramTitle(ogTitle);
    caption = parsed.caption || description;
    author =
      meta(html, "name", "twitter:title")?.match(/\(@([^)]+)\)/)?.[1] ||
      parsed.accountName ||
      null;
    externalId = instagramShortcode(url);
    publishedAt = publishedAt || instagramDate(externalId);
    title = firstMeaningfulLine(caption, author || "Publicação do Instagram");
    provider = "instagram-public-meta";
  } else if (url.hostname.includes("tiktok")) {
    externalId = tiktokId(url);
    publishedAt = publishedAt || tiktokDate(externalId);
    title = firstMeaningfulLine(caption, ogTitle || "Publicação do TikTok");
    provider = "tiktok-public-meta";
  } else {
    title = firstMeaningfulLine(
      typeof ldItem?.headline === "string" ? ldItem.headline : ogTitle,
      "Publicação externa",
    );
  }

  const date = publishedAt ? new Date(publishedAt) : null;
  if (!date || Number.isNaN(date.getTime()))
    throw new Error(
      "Não foi possível identificar a data e a hora reais da publicação",
    );

  return {
    platform: platform(url.hostname),
    title,
    caption: caption || null,
    author,
    published_at: date.toISOString(),
    thumbnail_url: thumbnail,
    external_media_id: externalId,
    provider,
  } satisfies PublicationMetadata;
}
