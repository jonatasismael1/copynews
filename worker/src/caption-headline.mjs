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

export function recoverBrandOnlyHeadline(title, caption) {
  if (!isLikelyBrandOnlyTitle(title, caption)) return String(title || "").trim();
  return deriveHeadlineFromCaption(caption);
}
