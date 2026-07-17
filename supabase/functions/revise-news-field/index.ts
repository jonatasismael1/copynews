import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function cleanCaption(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const boilerplate = /^(acesse (a )?mat[eé]ria|saiba mais|leia mais|siga (o|a|nossa)|envie sugest[oõ]es|a sua participa[cç][aã]o|inova[cç][aã]o em jornalismo|\d+\s+segundos\s*$|reda[cç][aã]o\b|anuncie\b|oferecimento\b|patroc[ií]nio\b|apoio\b|(?:a|o)\s+(?:r[aá]dio|portal|emissora|equipe).*\b(?:cobertura|rep[oó]rter(?:es)?)\b|whatsapp\b|telefone\b|fone\b|contato\b|https?:\/\/|www\.|@\w+\s*$|#\w)/i;
  const contactOnly = /^(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}$/;
  const lines = value.split(/\n+/).map((line) => line.trim());
  const cutoff = lines.findIndex(
    (line) => {
      const searchable = line.replace(/^[^\p{L}\p{N}@#]+/u, "").trim();
      return boilerplate.test(searchable) || contactOnly.test(line);
    },
  );
  return lines
    .slice(0, cutoff >= 0 ? cutoff : lines.length)
    .filter(Boolean)
    .join("\n\n")
    .trim() || null;
}

function comparable(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
    : "";
}

async function context(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) throw new Error("Unauthorized");
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  const { data: profile } = await client
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("is_active", true)
    .single();
  if (!profile) throw new Error("Inactive user");
  return { client };
}

function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    try {
      return await fn(req);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      const status = message === "Unauthorized" ? 401 : 400;
      console.error(JSON.stringify({ message, status }));
      return json({ error: message }, status);
    }
  };
}

Deno.serve(
  handler(async (req) => {
    const { client } = await context(req);
    const body = await req.json();
    if (
      !["title", "caption"].includes(body.field) ||
      typeof body.instruction !== "string" ||
      body.instruction.length < 2
    )
      throw new Error("Entrada inválida");
    const { data: news, error } = await client
      .from("news_items")
      .select(
        "generated_title,generated_caption,original_title,clean_original_caption,transcript",
      )
      .eq("id", body.news_item_id)
      .single();
    if (error) throw error;
    const current =
      body.field === "title" ? news.generated_title : news.generated_caption;
    const original = body.field === "title"
      ? news.original_title
      : cleanCaption(news.clean_original_caption);
    let preview = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env("OPENROUTER_API_KEY")}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              Deno.env.get("APP_URL") || "https://copynews.netlify.app",
            "X-Title": "Copy News",
          },
          body: JSON.stringify({
          model:
            Deno.env.get("OPENROUTER_REWRITE_MODEL") ||
            Deno.env.get("OPENROUTER_MODEL") ||
            "x-ai/grok-4.3",
          messages: [
            {
              role: "system",
              content:
                "Você é editor jornalístico. Reescreva somente o campo solicitado usando exclusivamente as fontes fornecidas. É obrigatório mudar perceptivelmente a redação: reorganize a estrutura, a ordem das informações ou use equivalentes jornalísticos seguros; nunca devolva o texto literalmente igual. Preserve rigorosamente fatos, nomes, instituições, números, valores, locais, datas, horários, consequências, críticas, acusações, atribuições, tipo do acontecimento e nível de certeza. Não invente, complete, suavize nem agrave. Para títulos, use primeiro o Título Original, faça uma edição direta em capitalização jornalística normal e nunca ultrapasse 150 caracteres. Para legendas, reescreva primeiro a Legenda Original Limpa, melhorando fluidez e organização sem omitir fatos; use a transcrição apenas quando a legenda estiver ausente ou insuficiente. O título pode servir como contexto factual. Retorne somente o JSON definido.",
            },
            {
              role: "user",
              content: JSON.stringify({
                field: body.field,
                current,
                instruction: body.instruction,
                sources: {
                  originalTitle: news.original_title,
                  originalCaption: cleanCaption(
                    news.clean_original_caption,
                  ),
                  transcription: news.transcript,
                },
                correction:
                  attempt === 0
                    ? null
                    : "A resposta anterior foi rejeitada porque repetiu o texto de origem ou ultrapassou o limite. Faça uma reescrita realmente diferente e fiel.",
              }),
            },
          ],
          temperature: 0,
          top_p: 1,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "copy_news_field_revision",
              strict: true,
              schema: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
                additionalProperties: false,
              },
            },
          },
          provider: { require_parameters: true },
          }),
        },
      );
      if (!response.ok) throw new Error(`Falha da IA: ${response.status}`);
      const result = await response.json();
      const content = result.choices?.[0]?.message?.content;
      try {
        preview = JSON.parse(content || "{}").text?.trim() || "";
      } catch {
        throw new Error("Resposta inválida da IA");
      }
      const repeated =
        comparable(preview) !== "" &&
        [current, original]
          .map(comparable)
          .filter(Boolean)
          .includes(comparable(preview));
      const tooLong = body.field === "title" && preview.length > 150;
      if (preview && !repeated && !tooLong) break;
      preview = "";
    }
    if (!preview)
      throw new Error(
        "A IA não conseguiu produzir uma reescrita diferente e fiel",
      );
    return json({ preview });
  }),
);
