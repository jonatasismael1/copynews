import { spawn } from "node:child_process";

function capture(path) {
  return new Promise((resolve, reject) => {
    const child = spawn("tesseract", [path, "stdout", "-l", "por+eng", "--psm", "11"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; let error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output) : reject(new Error(`Tesseract saiu com ${code}: ${error.slice(-200)}`)));
  });
}

function candidate(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => {
    if (line.length < 4 || /^[@#]/.test(line) || /https?:|www\.|\.com\b/i.test(line)) return false;
    const letters = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    return letters >= Math.max(3, line.length * 0.45);
  });
  return lines.join(" ").replace(/\s+([,.;:!?])/g, "$1").trim().slice(0, 360);
}

export async function readFramesLocally(paths) {
  const results = [];
  for (const path of paths) {
    try { const text = candidate(await capture(path)); if (text.length >= 18) results.push(text); } catch { /* fallback handled by caller */ }
  }
  if (!results.length) return null;
  const title = results.sort((a, b) => {
    const aScore = Math.min(a.length, 220) - Math.max(0, a.length - 280) * 2;
    const bScore = Math.min(b.length, 220) - Math.max(0, b.length - 280) * 2;
    return bScore - aScore;
  })[0];
  return { title, text: results.join("\n"), confidence: 0.7, provider: "tesseract-local" };
}
