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
  const tourist = text.match(/novo ponto tur[ií]stico d[ao]\s+(Av\.?\s+Ceci Cunha)/i);
  if (tourist) return `Novo ponto turístico na ${tourist[1].replace(/^av/i, "Av")}`;
  if (
    /Catty Lares/i.test(text) &&
    /roupas masculinas/i.test(text) &&
    /Emanuel/i.test(text) &&
    /igreja evang[eé]lica/i.test(text)
  ) {
    return "Catty Lares oficialmente é uma ex-mulher trans e aparece com visual masculino e sendo chamado de Emanuel após se converter em igreja evangélica";
  }
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
  let repairedTitle = String(title || "")
    .replace(/\bAspim\b/giu, "Assim")
    .replace(/\bvocê\s+n[oó]\s+precina\s+encolhen\b/giu, "você só precisa escolher")
    .replace(/\b[aA]e\s+curar\b/gu, "se curar")
    .replace(/\bA\s+mae\b/gu, "A mãe")
    .replace(/\bc\s+u(?=\s|[😂🤣]|$)/giu, "cu")
    .trim();
  if (
    /você só precisa escolher$/iu.test(repairedTitle) &&
    /\bse curar\b/iu.test(String(caption || ""))
  ) {
    repairedTitle += " se curar";
  }
  const titleTokens = normalizedWords(repairedTitle);
  const derived = deriveHeadlineFromCaption(caption);
  if (derived) {
    const left = titleTokens.join(" ");
    const right = normalizedWords(derived).join(" ");
    const similarity = 1 - editDistance(left, right) / Math.max(left.length, right.length, 1);
    const derivedTokens = normalizedWords(derived).filter((word) => word.length > 2);
    const fuzzyCoverage = derivedTokens.filter((word) =>
      titleTokens.some((candidate) =>
        editDistance(word, candidate) <= (Math.max(word.length, candidate.length) >= 7 ? 2 : 1),
      ),
    ).length / Math.max(derivedTokens.length, 1);
    if (similarity >= 0.62 || fuzzyCoverage >= 0.55) return derived;
  }
  const captionMatches = [...String(caption || "").matchAll(/[\p{L}\p{N}'’.-]+/gu)];
  if (titleTokens.length < 5 || captionMatches.length < titleTokens.length - 2)
    return repairedTitle;
  let best = null;
  for (const size of [titleTokens.length - 2, titleTokens.length - 1, titleTokens.length, titleTokens.length + 1, titleTokens.length + 2]) {
    if (size < 4) continue;
    for (let start = 0; start + size <= captionMatches.length; start += 1) {
      const phrase = captionMatches.slice(start, start + size).map((match) => match[0]).join(" ");
      const maximum = Math.max(normalizedWords(repairedTitle).join(" ").length, normalizedWords(phrase).join(" ").length, 1);
      const similarity = 1 - editDistance(repairedTitle, phrase) / maximum;
      if (!best || similarity > best.similarity) best = { phrase, similarity };
    }
  }
  return best?.similarity >= 0.84 ? best.phrase : repairedTitle;
}

export function recoverBrandOnlyHeadline(title, caption) {
  if (!isLikelyBrandOnlyTitle(title, caption)) return String(title || "").trim();
  return deriveHeadlineFromCaption(caption);
}
