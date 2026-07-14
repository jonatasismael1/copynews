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
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);

await mkdir("artifacts", { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.locator("input[autocomplete=email]").fill(adminEmail);
  await page
    .locator("input[type=password]")
    .fill(process.env.INITIAL_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole("heading", { name: "Visão geral" }).waitFor();
  await page.screenshot({
    path: "artifacts/production-dashboard.png",
    fullPage: true,
  });

  await page.goto(`${base}/usuarios`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Usuários" }).waitFor();
  await page.getByRole("button", { name: "Novo usuário" }).click();
  const form = page.locator("form");
  await form.waitFor();
  await form.getByLabel("Nome", { exact: true }).fill(tempName);
  await form.getByLabel("E-mail", { exact: true }).fill(tempEmail);
  await form
    .getByLabel("Senha temporária", { exact: true })
    .fill("Temp#Copy2026!Aa");
  await form.getByLabel("Meta diária", { exact: true }).fill("6");
  await form.getByRole("button", { name: "Criar usuário" }).click();
  await page.getByText("Usuário criado", { exact: true }).waitFor();

  const goal = page.getByLabel(`Meta diária de ${tempName}`, { exact: true });
  await goal.waitFor();
  await goal.fill("9");
  await page.getByTitle(`Salvar meta de ${tempName}`).click();
  await page.getByText("Meta diária atualizada", { exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/production-users-goal.png",
    fullPage: true,
  });

  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw listed.error;
  const tempUser = listed.data.users.find((user) => user.email === tempEmail);
  if (!tempUser) throw new Error("UI-created user missing in Auth");
  const profile = await admin
    .from("profiles")
    .select("daily_goal,role,is_active")
    .eq("id", tempUser.id)
    .single();
  if (
    profile.error ||
    profile.data.daily_goal !== 9 ||
    profile.data.role !== "writer" ||
    !profile.data.is_active
  )
    throw profile.error || new Error("UI goal/profile verification failed");

  await page.goto(
    `${base}/noticias/bced61cd-31e3-4a95-b1a3-36de7459e6c8`,
    { waitUntil: "networkidle" },
  );
  await page
    .getByRole("heading", {
      name: "Carro é consumido pelas chamas no bairro Alto do Cruzeiro, em Arapiraca",
    })
    .waitFor();
  const downloadButton = page.getByRole("button", { name: "Baixar vídeo" });
  if (!(await downloadButton.isEnabled()))
    throw new Error("Download button disabled");
  const popupPromise = page.waitForEvent("popup", { timeout: 15_000 });
  await downloadButton.click();
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await page.screenshot({
    path: "artifacts/production-reel-success.png",
    fullPage: true,
  });

  const relevantErrors = errors.filter((message) => !message.includes("favicon"));
  if (relevantErrors.length)
    throw new Error(`Browser errors: ${relevantErrors.join(" | ")}`);
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "production login",
        "dashboard render",
        "user creation through UI",
        "other-user goal update through UI",
        "recovered Reel detail",
        "download action opened signed media",
      ],
      screenshots: [
        "artifacts/production-dashboard.png",
        "artifacts/production-users-goal.png",
        "artifacts/production-reel-success.png",
      ],
    }),
  );
} finally {
  if (browser) await browser.close();
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const tempUser = listed.data?.users?.find((user) => user.email === tempEmail);
  if (tempUser) await admin.auth.admin.deleteUser(tempUser.id);
}
