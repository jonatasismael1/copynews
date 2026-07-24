import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  buildVideoRenderArgs,
  calculateMediaFrame,
} from "../worker/src/design-render.mjs";

const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), "copy-news-render-test-"));

async function render(name, width, height) {
  const source = join(directory, `${name}.mp4`);
  const overlay = join(directory, "overlay.png");
  const output = join(directory, `${name}-output.mp4`);
  await exec("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=size=${width}x${height}:rate=30:duration=1`,
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=900:duration=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    source,
  ]);
  await exec("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black@0.0:s=1080x1920,format=rgba,drawbox=x=100:y=1400:w=880:h=200:color=red@0.8:t=fill",
    "-frames:v",
    "1",
    overlay,
  ]);
  await exec(
    "ffmpeg",
    buildVideoRenderArgs(
      source,
      overlay,
      output,
      calculateMediaFrame(width, height, { fit: "cover", zoom: 1 }),
    ),
  );
  const { stdout } = await exec("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height",
    "-of",
    "json",
    output,
  ]);
  const streams = JSON.parse(stdout).streams;
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (video?.width !== 1080 || video?.height !== 1920 || !audio)
    throw new Error(`${name}: saída inválida`);
  console.log(`${name}: 1080x1920 com áudio`);
}

try {
  await render("horizontal", 1920, 1080);
  await render("vertical", 1080, 1920);
} finally {
  await rm(directory, { recursive: true, force: true });
}
