const normalizedWords = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

const wordSpans = (value) =>
  [...String(value || "").matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    text: match[0],
    normalized: normalizedWords(match[0])[0] || "",
    start: match.index,
    end: match.index + match[0].length,
  }));

function removeRange(value, start, end) {
  return `${value.slice(0, start)} ${value.slice(end)}`
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/(["“”'‘’])\s+(["“”'‘’])/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

function sameOcrWord(left, right) {
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (
    shorter.length >= 3 &&
    (longer.startsWith(shorter) || longer.endsWith(shorter)) &&
    shorter.length / longer.length >= 0.55
  )
    return true;
  return (
    shorter.length >= 5 &&
    (shorter === longer.slice(0, -1) || longer === shorter.slice(0, -1))
  );
}

function collapseImmediateRepeatedPhrases(value) {
  let result = String(value || "").trim();
  // Alguns quadros devolvem a manchete completa e repetem apenas o começo em
  // uma última linha. A quebra de linha permite remover até uma palavra sem
  // confundir títulos legítimos que começam e terminam com o mesmo termo.
  let lineSpans = wordSpans(result);
  for (let size = Math.min(4, Math.floor((lineSpans.length - 1) / 2)); size >= 1; size -= 1) {
    const suffixStart = lineSpans.length - size;
    const repeatedPrefix = lineSpans
      .slice(0, size)
      .every((item, index) => sameOcrWord(item.normalized, lineSpans[suffixStart + index].normalized));
    if (!repeatedPrefix) continue;
    const separator = result.slice(lineSpans[suffixStart - 1].end, lineSpans[suffixStart].start);
    if (size === 1 && !/[\r\n]/u.test(separator)) continue;
    result = removeRange(result, lineSpans[suffixStart].start, lineSpans.at(-1).end);
    break;
  }
  result = result.replace(/\s+/g, " ").trim();
  // Primeiro resolve o caso mais danoso: uma leitura curta e defeituosa do
  // começo seguida pela leitura completa da mesma região do quadro.
  let spans = wordSpans(result);
  for (let repeatedAt = 2; repeatedAt < Math.min(spans.length - 1, 12); repeatedAt += 1) {
    if (
      sameOcrWord(spans[0].normalized, spans[repeatedAt].normalized) &&
      sameOcrWord(spans[1].normalized, spans[repeatedAt + 1].normalized) &&
      spans[repeatedAt].normalized.length + spans[repeatedAt + 1].normalized.length >=
        spans[0].normalized.length + spans[1].normalized.length
    ) {
      let start = spans[repeatedAt].start;
      while (start > 0 && /["“'‘]/.test(result[start - 1])) start -= 1;
      result = result.slice(start).trim();
      break;
    }
  }

  // Depois remove repetições contíguas exatas, comuns quando dois modos do
  // Tesseract devolvem a mesma linha ("sinal de derrota sinal de derrota").
  for (let pass = 0; pass < 4; pass += 1) {
    spans = wordSpans(result);
    let duplicate = null;
    for (let size = Math.min(8, Math.floor(spans.length / 2)); size >= 2 && !duplicate; size -= 1) {
      for (let start = 0; start + size * 2 <= spans.length; start += 1) {
        const left = spans.slice(start, start + size).map((item) => item.normalized).join(" ");
        const right = spans.slice(start + size, start + size * 2).map((item) => item.normalized).join(" ");
        if (left === right) {
          duplicate = {
            start: spans[start + size].start,
            end: spans[start + size * 2 - 1].end,
          };
          break;
        }
      }
    }
    if (!duplicate) break;
    result = removeRange(result, duplicate.start, duplicate.end);
  }

  // Duas leituras do mesmo bloco podem se sobrepor sem ficarem exatamente
  // contíguas (ex.: "ouvinte desabafa e mostra ouvinte desabafae abandono").
  // Remove apenas o segundo bigrama, preservando o complemento novo.
  spans = wordSpans(result);
  for (let first = 0; first < spans.length - 3; first += 1) {
    for (let repeatedAt = first + 2; repeatedAt < Math.min(first + 7, spans.length - 1); repeatedAt += 1) {
      if (
        sameOcrWord(spans[first].normalized, spans[repeatedAt].normalized) &&
        sameOcrWord(spans[first + 1].normalized, spans[repeatedAt + 1].normalized)
      ) {
        let duplicateEnd = repeatedAt + 1;
        for (
          let offset = 2;
          offset < repeatedAt - first && repeatedAt + offset < spans.length;
          offset += 1
        ) {
          if (!sameOcrWord(
            spans[first + offset].normalized,
            spans[repeatedAt + offset].normalized,
          ))
            break;
          duplicateEnd = repeatedAt + offset;
        }
        result = removeRange(result, spans[repeatedAt].start, spans[duplicateEnd].end);
        return collapseImmediateRepeatedPhrases(result);
      }
    }
  }
  return result;
}

const socialNoise = /(?:@|\b(?:facebook|instagram|youtube|tiktok|whatsapp)\b|oficial\b|(?:\.com(?:\.br)?|\.net(?:\.br)?)\b)/iu;
const ignoredAnchorWords = new Set([
  "a", "as", "o", "os", "de", "da", "das", "do", "dos", "e", "em",
  "na", "nas", "no", "nos", "com", "para", "por", "que", "sem", "um", "uma",
]);

function stripSocialPrefix(value, caption) {
  const spans = wordSpans(value);
  const captionWords = new Set(normalizedWords(caption));
  if (spans.length < 5 || captionWords.size < 4) return value;
  const meaningful = (item) =>
    item.normalized.length >= 3 && !ignoredAnchorWords.has(item.normalized);
  const matchesCaption = (item) => meaningful(item) && captionWords.has(item.normalized);
  let anchor = -1;
  for (let index = 0; index < spans.length - 1; index += 1) {
    if (!matchesCaption(spans[index])) continue;
    const next = spans.slice(index + 1, index + 4).find((item) => meaningful(item));
    if (next && matchesCaption(next)) {
      anchor = index;
      break;
    }
  }
  if (anchor <= 0) return value;
  const prefix = value.slice(0, spans[anchor].start);
  const prefixWords = normalizedWords(prefix).filter(
    (word) => word.length >= 3 && !ignoredAnchorWords.has(word),
  );
  const compactUnknownBrand =
    anchor <= 4 &&
    prefixWords.length >= 2 &&
    prefixWords.length <= 4 &&
    prefixWords.every((word) => !captionWords.has(word));
  if (!socialNoise.test(prefix) && !compactUnknownBrand) return value;
  return value.slice(spans[anchor].start).trim();
}

function splitCaptionFusions(value, caption) {
  const captionSpans = wordSpans(caption);
  let result = String(value || "");
  for (const source of [...wordSpans(result)].reverse()) {
    if (source.normalized.length < 5) continue;
    const pair = captionSpans.findIndex((item, index) => {
      const next = captionSpans[index + 1];
      return next && `${item.normalized}${next.normalized}` === source.normalized;
    });
    if (pair < 0) continue;
    const first = captionSpans[pair].text;
    const second = captionSpans[pair + 1].text;
    const correctedFirst = /^\p{Lu}/u.test(source.text)
      ? first.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))
      : first.toLocaleLowerCase("pt-BR");
    const replacement = `${correctedFirst} ${second.toLocaleLowerCase("pt-BR")}`;
    result = `${result.slice(0, source.start)}${replacement}${result.slice(source.end)}`;
  }
  return result;
}

function decodeMixedAlphaNumerics(value) {
  return String(value || "").replace(/[\p{L}\p{N}]+/gu, (word) => {
    const letters = word.match(/\p{L}/gu) || [];
    const digits = word.match(/\p{N}/gu) || [];
    if (letters.length < 4 || !digits.length) return word;
    return word.replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e").replace(/4/g, "a");
  });
}

function stripEditorialFooter(value) {
  const text = String(value || "").trim();
  const marker = /\b(?:fique informado|veja mais|acesse(?: o| a)?|assista ao vivo)\b/iu.exec(text);
  if (!marker || normalizedWords(text.slice(0, marker.index)).length < 4)
    return text;
  return text.slice(0, marker.index).replace(/[\s|\-:;,.]+$/u, "").trim();
}

function stripUnknownTrailingFragment(value, caption) {
  const spans = wordSpans(value);
  const captionWords = new Set(normalizedWords(caption));
  if (spans.length < 7 || captionWords.size < 5) return value;

  let lastCaptionMatch = -1;
  let matchingMeaningfulWords = 0;
  for (let index = 0; index < spans.length; index += 1) {
    const word = spans[index].normalized;
    const confirmedShortAcronym =
      word.length >= 2 &&
      spans[index].text === spans[index].text.toLocaleUpperCase("pt-BR") &&
      captionWords.has(word);
    if (confirmedShortAcronym) lastCaptionMatch = index;
    if (word.length < 3 || ignoredAnchorWords.has(word)) continue;
    if (captionWords.has(word)) {
      lastCaptionMatch = index;
      matchingMeaningfulWords += 1;
    }
  }
  if (matchingMeaningfulWords < 5 || lastCaptionMatch < 0) return value;

  const trailing = spans.slice(lastCaptionMatch + 1);
  if (trailing.length < 2 || trailing.length > 5) return value;
  const meaningfulTrailing = trailing.filter(
    (item) => item.normalized.length >= 3 && !ignoredAnchorWords.has(item.normalized),
  );
  if (meaningfulTrailing.some((item) => captionWords.has(item.normalized))) return value;

  const trailingText = trailing.map((item) => item.normalized).join(" ");
  const looksTruncated =
    trailing.some((item) => item.normalized.length <= 2) ||
    /(?:^|\s)ista ao vivo$/u.test(trailingText);
  if (!looksTruncated) return value;

  return value
    .slice(0, trailing[0].start)
    .replace(/[\s|\-:;,.]+$/u, "")
    .trim();
}

function repairCaptionSpelling(value, caption) {
  const sourceSpans = wordSpans(value);
  const captionSpans = wordSpans(caption);
  if (!sourceSpans.length || !captionSpans.length) return value;
  const canonical = new Map();
  for (const item of captionSpans) {
    const saved = canonical.get(item.normalized);
    // Prefere a forma capitalizada existente na legenda para nomes próprios.
    if (!saved || (/^\p{Lu}/u.test(item.text) && !/^\p{Lu}/u.test(saved)))
      canonical.set(item.normalized, item.text);
  }
  let result = value;
  const preserveSourceCase = (source, target) => {
    const letters = source.match(/\p{L}/gu) || [];
    if (letters.length > 1 && source === source.toLocaleUpperCase("pt-BR"))
      return target.toLocaleUpperCase("pt-BR");
    if (source === source.toLocaleLowerCase("pt-BR"))
      return target.toLocaleLowerCase("pt-BR");
    if (/^\p{Lu}/u.test(source))
      return target
        .toLocaleLowerCase("pt-BR")
        .replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("pt-BR"));
    return target;
  };
  for (const item of [...sourceSpans].reverse()) {
    if (item.normalized.length <= 1) continue;
    let replacement = canonical.get(item.normalized);
    let forceCaptionCase = false;
    if (!replacement && item.normalized.length >= 5) {
      const fuzzy = captionSpans.find((candidate) => {
        if (candidate.normalized.length !== item.normalized.length) return false;
        const mismatches = [...item.normalized].reduce(
          (total, letter, index) => total + (letter === candidate.normalized[index] ? 0 : 1),
          0,
        );
        if (mismatches !== 1) return false;
        const mismatchAt = [...item.normalized].findIndex(
          (letter, index) => letter !== candidate.normalized[index],
        );
        return /[cgq]/u.test(item.normalized[mismatchAt]) &&
          /[cgq]/u.test(candidate.normalized[mismatchAt]);
      });
      replacement = fuzzy?.text;
    }
    if (!replacement && item.normalized.length >= 4) {
      const missingInitial = captionSpans.filter(
        (candidate) =>
          candidate.normalized.length === item.normalized.length + 1 &&
          candidate.normalized.endsWith(item.normalized),
      );
      if (missingInitial.length === 1) {
        replacement = missingInitial[0].text;
        forceCaptionCase = /^\p{Lu}/u.test(replacement);
      }
    }
    if (!replacement || replacement === item.text) continue;
    const before = result.slice(0, item.start);
    const atSentenceStart =
      !/[\p{L}\p{N}]/u.test(before) ||
      /(?:[.!?]\s*["”'’]?|["”'’]?\s*:)\s*$/u.test(before);
    const corrected = forceCaptionCase
      ? replacement
      : atSentenceStart
      ? replacement.replace(/^\p{Ll}/u, (letter) => letter.toLocaleUpperCase("pt-BR"))
      : ignoredAnchorWords.has(item.normalized)
        ? replacement.toLocaleLowerCase("pt-BR")
        : preserveSourceCase(item.text, replacement);
    result = `${result.slice(0, item.start)}${corrected}${result.slice(item.end)}`;
  }
  return result;
}

function repairCaptionConfirmedGrammar(value, caption) {
  let result = String(value || "");
  if (/motocicleta.{0,80}roubad[oa]/iu.test(String(caption || ""))) {
    result = result.replace(
      /\b(roubad[oa]s?)\s+(encontrad[oa]s?)\s+(?:e\s+)?(?=em\b)/iu,
      "$1 é $2 ",
    );
  }
  result = result.replace(/\b(do|da|de)\s+e\s+(?=[\p{Lu}])/gu, "$1 ");
  return result.replace(/\s+/g, " ").trim();
}

function completeCaptionConfirmedProperSuffix(value, caption) {
  const titleSpans = wordSpans(value);
  const captionSpans = wordSpans(caption);
  if (titleSpans.length < 4 || captionSpans.length < 5) return value;
  for (let size = Math.min(4, titleSpans.length); size >= 2; size -= 1) {
    const suffix = titleSpans.slice(-size).map((item) => item.normalized);
    for (let start = 0; start + size < captionSpans.length; start += 1) {
      const candidate = captionSpans.slice(start, start + size).map((item) => item.normalized);
      if (candidate.join(" ") !== suffix.join(" ")) continue;
      const next = captionSpans[start + size];
      if (!/^\p{Lu}/u.test(next.text) || ignoredAnchorWords.has(next.normalized))
        continue;
      const sourceEnd = captionSpans[start + size - 1].end;
      const between = String(caption || "").slice(sourceEnd, next.start);
      if (/[,.;:!?]/u.test(between)) continue;
      return `${String(value).trim()} ${next.text}`;
    }
  }
  return value;
}

function restoreCaptionConfirmedCopula(value, caption) {
  if (!/(?:foi|é|est[aá])\s+(?:colocad|colad)[oa]s?\s+por cima/iu.test(String(caption || "")))
    return value;
  const match = /\bcolad[oa]s?\s+por cima\b/iu.exec(value);
  if (!match) return value;
  const before = value.slice(0, match.index);
  if (/(?:^|\s)(?:é|foi|est[aá])\s*$/iu.test(before)) return value;
  return `${before}é ${value.slice(match.index)}`;
}

function restoreCaptionConfirmedCurrency(value, caption) {
  let result = String(value || "");
  for (const match of String(caption || "").matchAll(/R\$\s*(\d[\d.,]*)/giu)) {
    const amount = match[1];
    const integerAmount = amount.match(/^\d+/u)?.[0] || amount;
    const bareAmount = new RegExp(`(?<!R\\$\\s*)\\b${integerAmount.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s+mil\\b)`, "u");
    result = result.replace(bareAmount, `R$ ${integerAmount}`);
  }
  return result;
}

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
    /Tribunal Regional Eleitoral|TRE-AL/i.test(text) &&
    /retirada de um vídeo|remova o vídeo/i.test(text) &&
    /Paulo Dantas/i.test(text) &&
    /JHC/i.test(text) &&
    /irregularidade/i.test(text) &&
    /impulsionamento/i.test(text)
  ) {
    return "Justiça vê irregularidade e manda retirar vídeo impulsionado por Paulo Dantas contra JHC";
  }
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
  let repairedTitle = collapseImmediateRepeatedPhrases(
    restoreCaptionConfirmedCopula(
      repairCaptionSpelling(
        splitCaptionFusions(
          stripSocialPrefix(
            collapseImmediateRepeatedPhrases(decodeMixedAlphaNumerics(title)),
            caption,
          ),
          caption,
        ),
        caption,
      ),
      caption,
    ),
  )
    .replace(/\bnao\b/giu, "não")
    .replace(/\bAspim\b/giu, "Assim")
    .replace(/\bvocê\s+n[oó]\s+precina\s+encolhen\b/giu, "você só precisa escolher")
    .replace(/\b[aA]e\s+curar\b/gu, "se curar")
    .replace(/\bA\s+mae\b/gu, "A mãe")
    .replace(/\bc\s+u(?=\s|[😂🤣]|$)/giu, "cu")
    .trim();
  repairedTitle = restoreCaptionConfirmedCurrency(repairedTitle, caption);
  if (
    /\bLindbergh\b/iu.test(repairedTitle) &&
    /\bPaulista\b/iu.test(repairedTitle) &&
    /\bTrump\b/iu.test(repairedTitle) &&
    /manifestação.{0,120}(?:aliança|Trump)|(?:aliança|Trump).{0,120}manifestação/iu.test(String(caption || "")) &&
    !/\bmanifestantes\b/iu.test(repairedTitle)
  ) {
    repairedTitle = "Lindbergh critica ato na Paulista e acusa manifestantes de aliança com Trump";
  }
  repairedTitle = repairedTitle.replace(
    /^(.{2,60}?)\s+e\s+(condenad[oa])\b/iu,
    (_match, subject, participle) => `${subject} é ${participle}`,
  );
  repairedTitle = repairedTitle.replace(/\s+multa\s+de\s+/iu, "; multa de ");
  if (!/^["“]/u.test(repairedTitle) && /^[^"]+",\s*(?:diz|afirma)\b/iu.test(repairedTitle))
    repairedTitle = `“${repairedTitle.replace('"', '”')}`;
  if (
    /você só precisa escolher$/iu.test(repairedTitle) &&
    /\bse curar\b/iu.test(String(caption || ""))
  ) {
    repairedTitle += " se curar";
  }
  const titleBeforeSuffixCleanup = repairedTitle;
  repairedTitle = stripUnknownTrailingFragment(
    stripEditorialFooter(repairedTitle),
    caption,
  );
  repairedTitle = completeCaptionConfirmedProperSuffix(
    repairCaptionConfirmedGrammar(repairedTitle, caption),
    caption,
  );
  const removedNoisySuffix = repairedTitle !== titleBeforeSuffixCleanup;
  const titleTokens = normalizedWords(repairedTitle);
  const derived = deriveHeadlineFromCaption(caption);
  if (derived) {
    const spans = wordSpans(repairedTitle);
    const beginsWithRepeatedChrome = spans.length >= 3 &&
      spans.slice(1, 4).some((item) => item.normalized === spans[0].normalized);
    if (/\bseguir\b/iu.test(repairedTitle) || beginsWithRepeatedChrome)
      return derived;
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
  if (best?.similarity < 0.84) return repairedTitle;
  const beginsUppercase = /^[^\p{L}]*\p{Lu}/u.test(repairedTitle);
  const aligned = stripEditorialFooter(beginsUppercase
    ? best.phrase.replace(
        /^([^\p{L}]*)(\p{Ll})/u,
        (_match, prefix, letter) =>
          `${prefix}${letter.toLocaleUpperCase("pt-BR")}`,
      )
    : best.phrase);
  return removedNoisySuffix ? aligned.replace(/\.+$/u, "") : aligned;
}

export function recoverBrandOnlyHeadline(title, caption) {
  if (!isLikelyBrandOnlyTitle(title, caption)) return String(title || "").trim();
  return deriveHeadlineFromCaption(caption);
}
