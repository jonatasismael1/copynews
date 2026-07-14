import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, AudioLines, ClipboardPaste, Link2, Sparkles } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useCreateNews, useLookups } from "@/hooks/use-data";
import { createNewsSchema, type CreateNewsInput } from "@/lib/schemas";

const editorialTones = [
  ["Informativo", "Notícias e atualizações"],
  ["Analítico", "Contextualizar acontecimentos"],
  ["Didático", "Explicar temas complexos"],
  ["Humanizado", "Contar histórias e destacar personagens"],
  ["Prestação de serviço", "Oferecer informações úteis ao público"],
  ["Crítico", "Analisar com questionamento e rigor"],
  ["Opinativo", "Apresentar uma perspectiva argumentada"],
] as const;

export function CreateNewsPage() {
  const navigate = useNavigate();
  const { data } = useLookups();
  const mutation = useCreateNews();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateNewsInput>({
    resolver: zodResolver(createNewsSchema),
    defaultValues: { editorial_tone: "Informativo", transcribe_audio: false },
  });

  async function submit(values: CreateNewsInput) {
    const result = await mutation.mutateAsync(values);
    navigate(`/noticias/${result.news_item_id}`);
  }

  async function pasteSourceUrl() {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) return toast.error("A área de transferência está vazia");
      setValue("source_url", value, { shouldDirty: true, shouldValidate: true });
      toast.success("Link colado");
    } catch {
      toast.error("Permita o acesso à área de transferência ou cole manualmente");
    }
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
              <Button
                className="mt-2 w-full sm:w-auto"
                type="button"
                variant="outline"
                onClick={pasteSourceUrl}
              >
                <ClipboardPaste />
                Colar texto copiado
              </Button>
              {errors.source_url && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.source_url.message}
                </p>
              )}
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-muted/30 p-4">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-primary"
                {...register("transcribe_audio")}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <AudioLines size={17} className="text-primary" />
                  Transcrever o áudio
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Ative quando a fala do vídeo trouxer informações importantes.
                  Desativado, o conteúdo usa a legenda original e o texto visível.
                </span>
              </span>
            </label>

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
                <select
                  className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
                  {...register("editorial_tone")}
                >
                  {editorialTones.map(([tone, description]) => (
                    <option key={tone} value={tone}>
                      {tone} — {description}
                    </option>
                  ))}
                </select>
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
