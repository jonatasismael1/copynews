const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());

if (missing.length) {
  console.error(`DEPLOY BLOQUEADO: variáveis públicas ausentes: ${missing.join(", ")}.`);
  console.error("Use o ambiente configurado do Netlify; nunca publique um dist criado sem essas variáveis.");
  process.exit(1);
}

try {
  const url = new URL(process.env.VITE_SUPABASE_URL);
  if (url.protocol !== "https:") throw new Error();
} catch {
  console.error("DEPLOY BLOQUEADO: VITE_SUPABASE_URL deve ser uma URL HTTPS válida.");
  process.exit(1);
}

if (process.env.VITE_SUPABASE_PUBLISHABLE_KEY.length < 40) {
  console.error("DEPLOY BLOQUEADO: VITE_SUPABASE_PUBLISHABLE_KEY parece inválida.");
  process.exit(1);
}
