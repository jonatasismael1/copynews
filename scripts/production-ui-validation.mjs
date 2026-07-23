import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright-core";

const required = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "INITIAL_ADMIN_PASSWORD"];
for (const key of required)
  if (!process.env[key]) throw new Error(`Missing ${key}`);

const base = process.env.APP_URL || "https://copynews.netlify.app";
const executablePath =
  process.env.BROWSER_PATH ||
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const adminEmail = process.env.INITIAL_ADMIN_EMAIL || "admin@copynews.local";
const tempEmail = `ui-prod-${Date.now()}@copynews.local`;
const tempName = "Teste Produção Metas";
const reel =
  "https://www.instagram.com/reel/DavpwruN_4A/?utm_source=ui_production_test";
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator("input[autocomplete=email]").fill(adminEmail);
  await page
    .locator("input[type=password]")
    .fill(process.env.INITIAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${base}/`);
}

await mkdir("artifacts", { recursive: true });
let browser;
let tempPublicationId;
try {
  const pwaAssets = await Promise.all(
    ["manifest.webmanifest", "sw.js", "pwa-192.png", "pwa-512.png"].map(
      async (path) => ({ path, response: await fetch(`${base}/${path}`) }),
    ),
  );
  if (pwaAssets.some(({ response }) => !response.ok))
    throw new Error("PWA assets are not available");
  const manifest = await pwaAssets[0].response.json();
  if (
    manifest.display !== "standalone" ||
    !manifest.icons?.some((icon) => icon.sizes === "192x192") ||
    !manifest.icons?.some((icon) => icon.sizes === "512x512")
  )
    throw new Error("PWA manifest is incomplete");

  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await login(page);
  await page.getByRole("heading", { name: "Visão geral" }).waitFor();
  await page.getByRole("button", { name: "3 meses" }).click();
  await page.screenshot({
    path: "artifacts/production-dashboard.png",
    fullPage: true,
  });

  await page.goto(`${base}/usuarios`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const form = page.locator("form");
  await form.getByLabel("Nome", { exact: true }).fill(tempName);
  await form.getByLabel("E-mail", { exact: true }).fill(tempEmail);
  await form
    .getByLabel("Senha temporária", { exact: true })
    .fill("Temp#Copy2026!Aa");
  await form.getByLabel("Meta diária", { exact: true }).fill("6");
  await form.getByRole("button", { name: "Criar usuário" }).click();
  await page.getByText("Usuário criado", { exact: true }).waitFor();
  const goal = page.getByLabel(`Meta diária de ${tempName}`, { exact: true });
  await goal.fill("9");
  await page.getByTitle(`Salvar meta de ${tempName}`).click();
  await page.getByText("Meta diária atualizada", { exact: true }).waitFor();

  await page.goto(`${base}/criar`, { waitUntil: "networkidle" });
  const transcription = page.locator('input[name="transcribe_audio"]');
  if (!(await transcription.isChecked()))
    throw new Error("Transcription is not enabled by default");
  for (const removed of ["Categoria", "Página de destino", "Tom editorial"])
    if ((await page.getByText(removed, { exact: true }).count()) > 0)
      throw new Error(`Automatic field is still visible: ${removed}`);
  await page
    .getByText(
      "Categoria, página de destino e tom editorial serão definidos automaticamente a partir do conteúdo e das suas configurações.",
      { exact: true },
    )
    .waitFor();
  for (const removed of [
    "Autosave ativo",
    "Instagram, TikTok, YouTube e outras fontes suportadas pelo Cobalt.",
    "A pauta será atribuída automaticamente a você.",
    "Mídia temporária",
  ])
    if ((await page.getByText(removed, { exact: true }).count()) > 0)
      throw new Error(`Removed helper text is still visible: ${removed}`);

  await page.goto(`${base}/noticias`, { waitUntil: "networkidle" });
  await page.getByTitle("Arquivar notícia").first().waitFor();
  await page.getByTitle("Excluir notícia").first().waitFor();
  if ((await page.getByText("Limpar todas", { exact: true }).count()) > 0)
    throw new Error("Bulk delete action is still prominent");
  await page.getByText("Mais ações", { exact: true }).locator("..").click();
  await page.getByText("Excluir acervo", { exact: true }).waitFor();

  await page.goto(
    `${base}/noticias/bced61cd-31e3-4a95-b1a3-36de7459e6c8`,
    { waitUntil: "networkidle" },
  );
  await page.getByRole("heading", { name: /Carro.*Alto do Cruzeiro/i }).waitFor();
  await page.getByRole("link", { name: /instagram\.com\/reel/i }).first().waitFor();
  const originalCopy = page.getByRole("button", {
    name: "Copiar Legenda original",
  });
  await originalCopy.click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  if (!copied.includes("Corpo de Bombeiros Militar de Alagoas"))
    throw new Error("Original caption copy failed");
  const caption = await page.locator("textarea").nth(1).inputValue();
  if (caption.length < 250 || !caption.includes("\n\n"))
    throw new Error("Generated caption is not complete and paragraph-formatted");
  const responsibleSelect = page
    .getByText("Responsável", { exact: true })
    .locator("..")
    .locator("select");
  if (!(await responsibleSelect.isEnabled()))
    throw new Error("Admin cannot change the responsible user");
  await page.screenshot({
    path: "artifacts/production-reel-success.png",
    fullPage: true,
  });

  await page.goto(`${base}/publicacoes`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Adicionar publicação" }).click();
  await page.getByLabel("Link da publicação").fill(reel);
  await page.getByRole("button", { name: "Ler publicação" }).click();
  await page
    .getByText(/Carro de passeio foi atingido|Um carro de passeio foi atingido/i)
    .first()
    .waitFor();
  await page.getByText(/13 de jul.*2026.*16:20/i).waitFor();
  await page.getByRole("button", { name: "Registrar" }).click();
  await page.getByText("Publicação registrada", { exact: true }).waitFor();
  await page.getByTitle("Arquivar publicação").first().waitFor();
  await page.getByTitle("Excluir publicação").first().waitFor();
  const publication = await admin
    .from("publications")
    .select("id,published_at,caption,metadata_provider")
    .eq("published_url", reel)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (
    publication.error ||
    publication.data.caption?.length < 350 ||
    publication.data.metadata_provider !== "instagram-public-meta"
  )
    throw publication.error || new Error("UI publication metadata missing");
  tempPublicationId = publication.data.id;

  await page.goto(`${base}/configuracoes`, { waitUntil: "networkidle" });
  const avatarInput = page.locator('input[type="file"]');
  if ((await avatarInput.getAttribute("accept")) !== "image/jpeg,image/png,image/webp")
    throw new Error("Avatar gallery input is not configured");
  await page.screenshot({
    path: "artifacts/production-settings-pwa-avatar.png",
    fullPage: true,
  });

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobile.newPage();
  await login(mobilePage);
  for (const route of ["/", "/noticias", "/criar", "/publicacoes", "/configuracoes"]) {
    await mobilePage.goto(`${base}${route}`, { waitUntil: "networkidle" });
    const overflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (overflow) throw new Error(`Horizontal overflow on mobile route ${route}`);
  }
  await mobilePage.goto(`${base}/noticias`, { waitUntil: "networkidle" });
  await mobilePage.screenshot({
    path: "artifacts/production-mobile-news.png",
    fullPage: true,
  });
  await mobile.close();

  const relevantErrors = errors.filter(
    (message) => !message.includes("favicon") && !message.includes("AbortError"),
  );
  if (relevantErrors.length)
    throw new Error(`Browser errors: ${relevantErrors.join(" | ")}`);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "PWA manifest, service worker and icons",
        "production login and 90-day dashboard",
        "user creation and goal update",
        "automatic category, destination and tone",
        "transcription enabled by default",
        "direct news archive and delete controls",
        "discreet bulk action",
        "clickable source link and original-caption copy",
        "paragraph-formatted generated caption",
        "real publication import by URL with original timestamp",
        "direct publication archive and delete controls",
        "profile gallery input",
        "five mobile routes without horizontal overflow",
      ],
    }),
  );
} finally {
  if (browser) await browser.close();
  if (tempPublicationId)
    await admin.from("publications").delete().eq("id", tempPublicationId);
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const tempUser = listed.data?.users?.find((user) => user.email === tempEmail);
  if (tempUser) await admin.auth.admin.deleteUser(tempUser.id);
}
