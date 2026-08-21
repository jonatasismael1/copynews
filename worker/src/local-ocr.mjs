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
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Tesseract saiu com ${code}: ${error.slice(-200)}`)),
    );
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
    confidence < 45 ||
    text.length < 2 ||
    /^[@#]/.test(text) ||
    /https?:|www\.|\.com\b/i.test(text)
  )
    return false;
  const letters = (text.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (/^\d{2,4}$/.test(text)) return true;
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
  const medianHeight = [...lines].sort((a, b) => a.height - b.height)[
    Math.floor(lines.length / 2)
  ].height;
  const candidates = lines.filter(
    (line) =>
      line.height >= medianHeight * 0.9 &&
      line.text.length >= 8 &&
      line.text.length <= 140,
  );
  return (candidates.length ? candidates : lines)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 6);
}

export async function readFramesLocally(
  paths,
  { requirePersistence = paths.length > 1 } = {},
) {
  const frames = [];
  for (const path of paths) {
    try {
      frames.push((await capture(path)).flatMap(linesFromTsv));
    } catch {
      frames.push([]);
    }
  }
  const chosen = requirePersistence
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
