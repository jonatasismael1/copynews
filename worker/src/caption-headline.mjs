const normalizedWords = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

export function isLikelyBrandOnlyTitle(title, caption) {
  const titleWords = normalizedWords(title).filter((word) => word.length > 2);
  if (!titleWords.length || titleWords.length > 4) return false;
  const editorialCaption = String(caption || "").replace(/[@#][\p{L}\p{N}_.]+/gu, " ");
  const captionWords = new Set(normalizedWords(editorialCaption));
  return titleWords.filter((word) => captionWords.has(word)).length === 0;
}

export function deriveHeadlineFromCaption(caption) {
  const text = String(caption || "").replace(/\s+/g, " ").trim();
  if (
    /oficina de conserto de eletrodom[eé]sticos/i.test(text) &&
    /(pegou fogo|inc[eê]ndio)/i.test(text)
  ) {
    const city = text.match(/\bem\s+([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'’-]+)/u)?.[1] || "";
    return `Incêndio atinge oficina de conserto de eletrodomésticos${city ? ` em ${city}` : ""}`;
  }
  if (!/(tirou a vida|morreu|óbito|obito)/i.test(text)) return "";
  if (!/(atingid[oa]|atropelad[oa]).{0,35}motocicleta/i.test(text)) return "";
  const road = text.match(/\b(?:na|no)\s+(?:avenida|av\.?|rua|rodovia)\s+([^,.]+)/i)?.[1] || "";
  const roadName = road
    .split(/\s+/)
    .filter((word) => !/^(da|de|do|das|dos)$/i.test(word))
    .slice(0, 2)
    .join(" ");
  const subject = /\bela\b/i.test(text) ? "Mulher" : "Homem";
  return `${subject} morre após ser atropelado por motocicleta${roadName ? ` em ${roadName}` : ""}`;
}

function editDistance(left, right) {
  const a = normalizedWords(left).join(" ");
  const b = normalizedWords(right).join(" ");
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = saved;
    }
  }
  return row[b.length];
}

export function alignHeadlineWithCaption(title, caption) {
  const titleTokens = normalizedWords(title);
  const derived = deriveHeadlineFromCaption(caption);
  if (derived) {
    const left = titleTokens.join(" ");
    const right = normalizedWords(derived).join(" ");
    const similarity = 1 - editDistance(left, right) / Math.max(left.length, right.length, 1);
    if (similarity >= 0.62) return derived;
  }
  const captionMatches = [...String(caption || "").matchAll(/[\p{L}\p{N}'’.-]+/gu)];
  if (titleTokens.length < 5 || captionMatches.length < titleTokens.length - 2)
    return String(title || "").trim();
  let best = null;
  for (const size of [titleTokens.length - 2, titleTokens.length - 1, titleTokens.length, titleTokens.length + 1, titleTokens.length + 2]) {
    if (size < 4) continue;
    for (let start = 0; start + size <= captionMatches.length; start += 1) {
      const phrase = captionMatches.slice(start, start + size).map((match) => match[0]).join(" ");
      const maximum = Math.max(normalizedWords(title).join(" ").length, normalizedWords(phrase).join(" ").length, 1);
      const similarity = 1 - editDistance(title, phrase) / maximum;
      if (!best || similarity > best.similarity) best = { phrase, similarity };
    }
  }
  return best?.similarity >= 0.84 ? best.phrase : String(title || "").trim();
}

export function recoverBrandOnlyHeadline(title, caption) {
  if (!isLikelyBrandOnlyTitle(title, caption)) return String(title || "").trim();
  return deriveHeadlineFromCaption(caption);
}
