const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

function even(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function calculateMediaFrame(
  sourceWidth,
  sourceHeight,
  transform = {},
) {
  if (!sourceWidth || !sourceHeight)
    throw new Error("Dimensões do vídeo inválidas");
  const fit = transform.fit === "contain" ? "contain" : "cover";
  const zoom = Math.max(1, Math.min(3, Number(transform.zoom) || 1));
  const baseScale =
    fit === "contain"
      ? Math.min(OUTPUT_WIDTH / sourceWidth, OUTPUT_HEIGHT / sourceHeight)
      : Math.max(OUTPUT_WIDTH / sourceWidth, OUTPUT_HEIGHT / sourceHeight);
  const width = even(sourceWidth * baseScale * zoom);
  const height = even(sourceHeight * baseScale * zoom);
  const maxOffsetX = Math.max(0, (width - OUTPUT_WIDTH) / 2);
  const maxOffsetY = Math.max(0, (height - OUTPUT_HEIGHT) / 2);
  const offsetX = Math.max(
    -maxOffsetX,
    Math.min(maxOffsetX, Number(transform.offsetX) || 0),
  );
  const offsetY = Math.max(
    -maxOffsetY,
    Math.min(maxOffsetY, Number(transform.offsetY) || 0),
  );
  const x = (OUTPUT_WIDTH - width) / 2 + offsetX;
  const y = (OUTPUT_HEIGHT - height) / 2 + offsetY;
  return { fit, width, height, x, y };
}

export function buildVideoRenderArgs(source, overlay, output, frame) {
  const x = Math.round(frame.x);
  const y = Math.round(frame.y);
  return [
    "-y",
    "-i",
    source,
    "-loop",
    "1",
    "-i",
    overlay,
    "-filter_complex",
    `[0:v]scale=${frame.width}:${frame.height},setsar=1[scaled];color=c=black:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}[bg];[bg][scaled]overlay=${x}:${y}:shortest=1[base];[base][1:v]overlay=0:0:format=auto[outv]`,
    "-map",
    "[outv]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    output,
  ];
}
