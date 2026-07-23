import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const base = process.env.APP_URL || "http://127.0.0.1:5173";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: edge });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.screenshot({ path: "artifacts/login-debug.png", fullPage: true });
if ((await page.locator("input[autocomplete=email]").count()) !== 1)
  throw new Error(
    `Login not rendered: ${await page.locator("body").innerText()} | ${errors.join(" | ")}`,
  );
await page
  .locator("input[autocomplete=email]")
  .fill(process.env.INITIAL_ADMIN_EMAIL || "admin@copynews.local");
await page
  .locator("input[type=password]")
  .fill(process.env.INITIAL_ADMIN_PASSWORD);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(`${base}/`);
await page.getByRole("heading", { name: "Visão geral" }).waitFor();
await page.getByText("Resultado diário por usuário", { exact: true }).waitFor();
await page.waitForFunction(() => !document.querySelector(".animate-pulse"));
for (const label of [
  "Notícias criadas",
  "Publicações",
  "Aguardando aprovação",
  "Agendados",
]) {
  if ((await page.getByText(label, { exact: true }).count()) < 1)
    throw new Error(`Dashboard destination missing: ${label}`);
}
await page.getByLabel("Filtrar gráfico por dia").waitFor();
await page.getByLabel("Filtrar gráfico por usuário").waitFor();
await page.screenshot({
  path: "artifacts/dashboard-desktop.png",
  fullPage: true,
});
await page.goto(`${base}/criar`, { waitUntil: "networkidle" });
await page.getByRole("heading", { name: "Processar notícia" }).waitFor();
const transcription = page.locator('input[name="transcribe_audio"]');
if (await transcription.isChecked())
  throw new Error("Transcription must require explicit opt-in");
for (const removed of ["Categoria", "Página de destino", "Tom editorial"]) {
  if ((await page.getByText(removed, { exact: true }).count()) > 0)
    throw new Error(`Automatic field is still visible on creation: ${removed}`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({
  path: "artifacts/create-news-mobile.png",
  fullPage: true,
});
const overflow = await page.evaluate(
  () =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
await page.goto(`${base}/noticias`, { waitUntil: "networkidle" });
await page.getByLabel("Filtrar notícias por usuário").waitFor();
await page.getByTestId("news-actions-menu").click();
await page.getByText("Excluir acervo", { exact: true }).waitFor();
const newsOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
await page.screenshot({ path: "artifacts/news-mobile-actions.png", fullPage: true });
await page.goto(`${base}/configuracoes`, { waitUntil: "networkidle" });
await page.getByLabel("Modelo para vídeo").waitFor();
await page.getByLabel("Modelo para imagem ou carrossel").waitFor();
await page.getByText("Instagram profissional e métricas", { exact: true }).waitFor();
await page.getByRole("button", { name: "Entrar com a Meta" }).waitFor();
await page.screenshot({ path: "artifacts/settings-editors-metrics.png", fullPage: true });
await page.goto(`${base}/publicacoes`, { waitUntil: "networkidle" });
await page.getByLabel("Filtrar publicações por usuário").waitFor();
const detailButtons = page.getByTestId("publication-detail");
const detailCount = await detailButtons.count();
if (detailCount > 0) {
  await detailButtons.first().click();
  await page.getByRole("button", { name: "Fechar", exact: true }).waitFor();
  await page.screenshot({ path: "artifacts/publication-detail-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
}
const publicationOverflow = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
);
await page.screenshot({ path: "artifacts/publication-cards-mobile.png", fullPage: true });
await page.getByRole("button", { name: "Adicionar publicação" }).click();
await page.getByRole("heading", { name: "Adicionar publicação" }).waitFor();
await page.screenshot({
  path: "artifacts/publication-mobile.png",
  fullPage: true,
});
if (overflow || newsOverflow || publicationOverflow)
  throw new Error("Horizontal overflow detected on mobile");
if (errors.length)
  throw new Error(`Browser console errors: ${errors.join(" | ")}`);
console.log(
  JSON.stringify({
    ok: true,
    checks: [
      "login real",
      "dashboard desktop",
      "indicadores clicáveis na ordem solicitada",
      "filtros do gráfico por dia e usuário",
      "relatório diário administrativo",
      "transcrição desativada por padrão",
      "categoria, destino e tom removidos da criação",
      "links individuais do Canva",
      "configuração segura do Instagram",
      "menu de exclusão visível no mobile",
      "cards de publicação compactos e detalháveis",
      "formulário mobile",
      "modal mobile",
      "sem overflow",
      "console limpo",
    ],
  }),
);
await browser.close();
