import { readdir, readFile } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "dist", "assets");
const files = (await readdir(assetsDir)).filter((file) => file.endsWith(".js"));
let configured = false;

for (const file of files) {
  const content = await readFile(join(assetsDir, file), "utf8");
  if (/https:\/\/[a-zA-Z0-9.-]+\.dbe\.digital/.test(content) && /(sb_publishable_|eyJ[A-Za-z0-9_-]+\.)/.test(content)) {
    configured = true;
    break;
  }
}

if (!configured) {
  console.error("DEPLOY BLOQUEADO: o bundle não contém a configuração pública do Supabase.");
  process.exit(1);
}

console.log("Bundle de produção validado: configuração pública do Supabase presente.");

const serviceWorker = await readFile(join(process.cwd(), "dist", "sw.js"), "utf8");
const precachedUrls = [...serviceWorker.matchAll(/\{url:"([^"]+)"/g)].map((match) => match[1]);
const precachedBytes = (
  await Promise.all(precachedUrls.map(async (url) => {
    try { return (await stat(join(process.cwd(), "dist", url))).size; }
    catch { return 0; }
  }))
).reduce((sum, size) => sum + size, 0);
const forbiddenRoutes = precachedUrls.filter((url) =>
  /assets\/(?:dashboard|publications|news-design|html2canvas)-/u.test(url),
);
if (precachedBytes > 1_250_000 || forbiddenRoutes.length) {
  console.error(`DEPLOY BLOQUEADO: precache PWA excessivo (${Math.round(precachedBytes / 1024)} KiB; rotas pesadas: ${forbiddenRoutes.join(", ") || "nenhuma"}).`);
  process.exit(1);
}
console.log(`PWA validado: ${precachedUrls.length} arquivos e ${Math.round(precachedBytes / 1024)} KiB no precache inicial.`);
