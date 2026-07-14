import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Info, Link2, Sparkles, UserRound, Video } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useCreateNews, useLookups } from "@/hooks/use-data";
import { createNewsSchema, type CreateNewsInput } from "@/lib/schemas";
import { useAuth } from "@/providers/auth-provider";

export function CreateNewsPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data } = useLookups();
  const mutation = useCreateNews();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateNewsInput>({
    resolver: zodResolver(createNewsSchema),
    defaultValues: { editorial_tone: "Jornalístico, claro e direto" },
  });

  async function submit(values: CreateNewsInput) {
    const result = await mutation.mutateAsync(values);
    navigate(`/noticias/${result.news_item_id}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft />
        Voltar
      </Button>
      <div>
        <p className="text-sm font-semibold text-primary">Nova pauta</p>
        <h1 className="mt-1 font-display text-3xl font-bold">
          Processar notícia
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cole a publicação original. O processamento continua mesmo se você
          sair desta tela.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="text-primary" />
            Link de origem
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit(submit)}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                URL da publicação *
              </span>
              <Input
                placeholder="https://instagram.com/reel/..."
                inputMode="url"
                {...register("source_url")}
              />
              {errors.source_url && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.source_url.message}
                </p>
              )}
              <p className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info size={14} className="mt-0.5 shrink-0" />
                Instagram, TikTok, YouTube e outras fontes suportadas pelo
                Cobalt. Links privados podem não estar disponíveis.
              </p>
            </label>

            <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-4">
              <div className="grid size-10 place-items-center rounded-full bg-background">
                <UserRound size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Responsável</p>
                <p className="font-semibold">{profile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  A pauta será atribuída automaticamente a você.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Categoria
                </span>
                <select
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                  {...register("category_id")}
                >
                  <option value="">Sem categoria</option>
                  {data?.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="mb-2 block text-sm font-semibold">
                  Página de destino
                </span>
                <select
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                  {...register("destination_page_id")}
                >
                  <option value="">Definir depois</option>
                  {data?.pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span className="mb-2 block text-sm font-semibold">
                  Tom editorial
                </span>
                <Input {...register("editorial_tone")} />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Observações
              </span>
              <Textarea
                placeholder="Contexto adicional, atenção a um fato, orientação de créditos..."
                {...register("notes")}
              />
            </label>
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
              <div className="flex gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Video size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold">Mídia temporária</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    O vídeo será usado apenas para preview, download,
                    transcrição e OCR. A limpeza automática remove o arquivo
                    após a expiração.
                  </p>
                </div>
              </div>
            </div>
            <Button className="w-full" size="lg" disabled={mutation.isPending}>
              <Sparkles />
              {mutation.isPending ? "Enviando..." : "Processar notícia"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
