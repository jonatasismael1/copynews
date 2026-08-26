import { spawn } from "node:child_process";

function captureMode(path, psm) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "tesseract",
      [path, "stdout", "-l", "por+eng", "--psm", String(psm), "tsv"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    let error = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("OCR local excedeu 15 segundos")));
    }, 15_000);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", (cause) => finish(() => reject(cause)));
    child.on("close", (code) => finish(() =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Tesseract saiu com ${code}: ${error.slice(-200)}`)),
    ));
  });
}
const capture = (path) =>
  Promise.all([captureMode(path, 6), captureMode(path, 11)]);

const normalized = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const tokens = (value) =>
  new Set(
    normalized(value)
      .split(" ")
      .filter((word) => word.length > 2),
  );
function similarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return 0;
  const common = [...left].filter((word) => right.has(word)).length;
  return common / Math.min(left.size, right.size);
}
function valid(text, confidence) {
  if (
    confidence < 35 ||
    (text.length < 2 && !/^[aeo]$/i.test(text)) ||
    /^[@#]/.test(text) ||
    /https?:|www\.|\.com\b/i.test(text)
  )
    return false;
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (/^(?:[aeo]|\d{2,4})$/i.test(text)) return true;
  return letters >= Math.max(2, text.length * 0.55);
}
function linesFromTsv(raw) {
  const rows = String(raw || "")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((cells) => cells.length >= 12 && cells[0] === "5");
  const groups = new Map();
  for (const cells of rows) {
    const text = cells.slice(11).join("\t").replace(/\s+/g, " ").trim();
    const confidence = Number(cells[10]);
    if (!valid(text, confidence)) continue;
    const key = cells.slice(1, 5).join(":");
    const word = {
      text,
      confidence,
      x: Number(cells[6]),
      y: Number(cells[7]),
      height: Number(cells[9]),
    };
    const current = groups.get(key) || [];
    current.push(word);
    groups.set(key, current);
  }
  return [...groups.values()]
    .map((words) => {
      words.sort((a, b) => a.x - b.x);
      return {
        text: words
          .map((word) => word.text)
          .join(" ")
          .replace(/\s+([,.;:!?])/g, "$1"),
        confidence:
          words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
        x: Math.min(...words.map((word) => word.x)),
        y: Math.min(...words.map((word) => word.y)),
        height: Math.max(...words.map((word) => word.height)),
      };
    })
    .filter((line) => line.text.length >= 8);
}
function persistentLines(frames) {
  const selected = [];
  const minimumFrames = Math.max(
    2,
    Math.ceil(frames.filter((frame) => frame.length).length * 0.5),
  );
  for (const frame of frames)
    for (const line of frame) {
      const matches = frames.flatMap((candidateFrame) =>
        candidateFrame.filter(
          (candidate) => similarity(line.text, candidate.text) >= 0.72,
        ),
      );
      const matchingFrames = frames.filter((candidateFrame) =>
        candidateFrame.some(
          (candidate) => similarity(line.text, candidate.text) >= 0.72,
        ),
      ).length;
      if (
        matchingFrames >= minimumFrames &&
        !selected.some(
          (candidate) => similarity(line.text, candidate.text) >= 0.72,
        )
      ) {
        const best = matches.sort(
          (a, b) =>
            tokens(b.text).size * 12 +
            b.confidence +
            b.text.length * 0.15 -
            (tokens(a.text).size * 12 + a.confidence + a.text.length * 0.15),
        )[0];
        selected.push({ ...best, repeats: matchingFrames });
      }
    }
  return selected.sort((a, b) => a.y - b.y || a.x - b.x);
}
function imageHeadline(lines) {
  if (!lines.length) return [];
  const unique = [];
  for (const line of lines) {
    const duplicateIndex = unique.findIndex(
      (candidate) =>
        similarity(line.text, candidate.text) >= 0.82 &&
        Math.abs(line.y - candidate.y) <= Math.max(line.height, candidate.height),
    );
    if (duplicateIndex < 0) unique.push(line);
    else {
      const currentQuality = tokens(line.text).size * 12 + line.confidence;
      const savedQuality =
        tokens(unique[duplicateIndex].text).size * 12 +
        unique[duplicateIndex].confidence;
      if (currentQuality > savedQuality) unique[duplicateIndex] = line;
    }
  }
  const medianHeight = [...unique].sort((a, b) => a.height - b.height)[
    Math.floor(unique.length / 2)
  ].height;
  const candidates = unique.filter(
    (line) =>
      line.height >= medianHeight * 0.7 &&
      line.text.length >= 8 &&
      line.text.length <= 140,
  );
  const sorted = (candidates.length ? candidates : unique)
    .filter((line) => line.confidence >= 70)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  if (!sorted.length) return unique.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 6);
  const clusters = [];
  for (const current of sorted) {
    const cluster = clusters.at(-1);
    const previous = cluster?.at(-1);
    const maximumGap = previous
      ? Math.max(96, Math.max(previous.height, current.height) * 2.5)
      : 0;
    if (!previous || current.y - previous.y <= maximumGap) {
      if (cluster) cluster.push(current);
      else clusters.push([current]);
    } else {
      clusters.push([current]);
    }
  }
  const score = (cluster) =>
    cluster.reduce(
      (sum, line) => sum + tokens(line.text).size * 18 + line.confidence * 0.2,
      0,
    );
  return clusters.sort((a, b) => score(b) - score(a))[0].slice(0, 6);
}

export function selectTemporalHeadline(frames) {
  const usableFrames = frames.filter((frame) => frame.length);
  if (!usableFrames.length) return [];
  const repeatedShortLines = usableFrames
    .flatMap((frame) => frame)
    .filter((line) => tokens(line.text).size <= 2)
    .filter((line, index, all) =>
      all.findIndex((candidate) => similarity(line.text, candidate.text) >= 0.82) === index,
    )
    .filter((line) =>
      usableFrames.filter((frame) =>
        frame.some((candidate) => similarity(line.text, candidate.text) >= 0.82),
      ).length >= Math.max(2, Math.ceil(usableFrames.length * 0.8)),
    );
  const candidates = usableFrames.map((frame, frameIndex) => {
    let lines = imageHeadline(frame).filter((line) =>
      !repeatedShortLines.some((repeated) => similarity(line.text, repeated.text) >= 0.82),
    );
    const richLines = lines.filter((line) => tokens(line.text).size >= 6);
    if (richLines.length) {
      const firstRichLineY = Math.min(...richLines.map((line) => line.y));
      lines = lines.filter((line) =>
        tokens(line.text).size >= 3 || line.y > firstRichLineY,
      );
    }
    const tokenCount = lines.reduce((sum, line) => sum + tokens(line.text).size, 0);
    const confidence = lines.reduce((sum, line) => sum + line.confidence, 0);
    return {
      lines,
      score: tokenCount * 18 + confidence * 0.25 + lines.reduce((sum, line) => sum + line.text.length, 0) + frameIndex,
    };
  });
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  return best?.lines.length ? best.lines : persistentLines(usableFrames);
}

export async function readFramesLocally(
  paths,
  { requirePersistence = paths.length > 1, temporalWindow = false } = {},
) {
  const frames = [];
  for (let index = 0; index < paths.length; index += 2) {
    const batch = await Promise.all(
      paths.slice(index, index + 2).map(async (path) => {
        try {
          return (await capture(path)).flatMap(linesFromTsv);
        } catch {
          return [];
        }
      }),
    );
    frames.push(...batch);
  }
  const chosen = temporalWindow
    ? selectTemporalHeadline(frames)
    : requirePersistence
      ? persistentLines(frames)
    : imageHeadline(frames[0] || []);
  const title = chosen
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
  if (title.length < 12 || tokens(title).size < 3) return null;
  const confidence =
    chosen.reduce((sum, line) => sum + line.confidence, 0) /
    chosen.length /
    100;
  return {
    title,
    text: title,
    confidence: Math.min(0.95, confidence),
    provider: "tesseract-local-consensus",
  };
}
