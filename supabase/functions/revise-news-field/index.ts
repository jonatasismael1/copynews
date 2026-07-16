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
        "generated_title,generated_caption,original_title,original_caption,clean_original_caption,transcript",
      )
      .eq("id", body.news_item_id)
      .single();
    if (error) throw error;
    const current =
      body.field === "title" ? news.generated_title : news.generated_caption;
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
                "Você é editor jornalístico. Reescreva somente o campo solicitado usando exclusivamente as fontes fornecidas. Preserve rigorosamente fatos, nomes, instituições, números, valores, locais, datas, horários, consequências, críticas, acusações, atribuições, tipo do acontecimento e nível de certeza. Não invente, complete, suavize nem agrave. Para títulos, use primeiro o Título Original, faça uma edição direta em capitalização jornalística normal e nunca ultrapasse 150 caracteres. Para legendas, reescreva primeiro a Legenda Original Limpa, melhorando fluidez e organização sem omitir fatos; use a transcrição apenas quando a legenda estiver ausente ou insuficiente. O título pode servir como contexto factual. Retorne somente o JSON definido.",
            },
            {
              role: "user",
              content: JSON.stringify({
                field: body.field,
                current,
                instruction: body.instruction,
                sources: {
                  originalTitle: news.original_title,
                  originalCaption:
                    news.clean_original_caption || news.original_caption,
                  transcription: news.transcript,
                },
              }),
            },
          ],
          temperature: 0,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
          reasoning: { effort: "none" },
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
    let preview: string;
    try {
      preview = JSON.parse(content || "{}").text?.trim() || "";
    } catch {
      throw new Error("Resposta inválida da IA");
    }
    if (!preview) throw new Error("Resposta inválida da IA");
    if (body.field === "title" && preview.length > 150)
      throw new Error("O título revisado ultrapassou 150 caracteres");
    return json({ preview });
  }),
);
