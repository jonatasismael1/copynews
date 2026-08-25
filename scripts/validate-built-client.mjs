import { readdir, readFile } from "node:fs/promises";
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
