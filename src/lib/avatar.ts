export async function squareAvatarDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Selecione uma imagem");
  if (file.size > 10_000_000)
    throw new Error("A imagem original deve ter no máximo 10 MB");
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = (bitmap.width - side) / 2;
  const sourceY = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem");
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, 512, 512);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.88);
}
