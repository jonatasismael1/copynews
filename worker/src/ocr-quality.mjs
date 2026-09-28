const normalizedWords = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

const ignoredWords = new Set([
  "a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em",
  "na", "nas", "no", "nos", "com", "para", "por", "que", "um", "uma",
]);

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      diagonal = saved;
    }
  }
  return row[right.length];
}

function closeWord(left, right) {
  if (left === right) return true;
  const length = Math.max(left.length, right.length);
  if (length < 5 || Math.min(left.length, right.length) < 4) return false;
  return editDistance(left, right) <= (length >= 8 ? 2 : 1);
}

function captionAgreement(title, caption) {
  const titleWords = normalizedWords(title).filter(
    (word) => word.length >= 3 && !ignoredWords.has(word),
  );
  const captionWords = normalizedWords(caption).filter(
    (word) => word.length >= 3 && !ignoredWords.has(word),
  );
  if (!titleWords.length || !captionWords.length) return null;
  const matches = titleWords.filter((word) =>
    captionWords.some((candidate) => closeWord(word, candidate)),
  ).length;
  return matches / titleWords.length;
}

function hasRepeatedPhrase(value) {
  const words = normalizedWords(value);
  for (const size of [4, 3, 2]) {
    const seen = new Map();
    for (let index = 0; index + size <= words.length; index += 1) {
      const phraseWords = words.slice(index, index + size);
      if (phraseWords.filter((word) => !ignoredWords.has(word)).length < 1)
        continue;
      const phrase = phraseWords.join(" ");
      const previous = seen.get(phrase);
      if (previous !== undefined && index - previous >= size) return true;
      if (previous === undefined) seen.set(phrase, index);
    }
  }
  return false;
}

export function ocrRefinementReasons(ocr, caption = "") {
  const title = String(ocr?.title || ocr?.text || "").trim();
  if (!title) return ["missing_title"];
  const reasons = [];
  const confidence = Number(ocr?.confidence);
  if (Number.isFinite(confidence) && confidence < 0.89)
    reasons.push("low_local_confidence");
  if (/\bR(?:\$|S)\s+(?=(?:milh|bilh)[õo]es?\b)/iu.test(title))
    reasons.push("missing_currency_amount");
  if (/\bmais\s+de\s+(?:a|à)\s+frente\b/iu.test(title))
    reasons.push("missing_comparison_amount");
  if (hasRepeatedPhrase(title)) reasons.push("repeated_phrase");
  const agreement = captionAgreement(title, caption);
  if (
    agreement !== null &&
    agreement < 0.42 &&
    normalizedWords(title).length >= 7 &&
    (!Number.isFinite(confidence) || confidence < 0.94)
  )
    reasons.push("low_caption_agreement");
  return [...new Set(reasons)];
}

export function shouldRefineOcrWithVision(ocr, caption = "") {
  return ocrRefinementReasons(ocr, caption).length > 0;
}

export function selectVisionHeadline(visionOcr) {
  const title = String(visionOcr?.title || "").trim();
  const lines = String(visionOcr?.text || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12 && line.length <= 220)
    .map((line) => ({ line, words: normalizedWords(line) }))
    .filter((item) => item.words.length >= 4)
    .sort((left, right) =>
      right.words.length - left.words.length || right.line.length - left.line.length,
    );
  const titleWords = normalizedWords(title);
  const mainLine = lines[0];
  if (
    mainLine &&
    titleWords.length <= 3 &&
    mainLine.words.length >= Math.max(8, titleWords.length * 3)
  )
    return mainLine.line;
  return title;
}
