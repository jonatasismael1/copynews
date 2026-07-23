import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  AudioLines,
  Check,
  ClipboardPaste,
  Info,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { useCreateNews } from "@/hooks/use-data";
import { createNewsSchema, type CreateNewsInput } from "@/lib/schemas";

type InfoTopic = "transcription" | "automatic" | null;

export function CreateNewsPage() {
  const navigate = useNavigate();
  const mutation = useCreateNews();
  const [infoTopic, setInfoTopic] = useState<InfoTopic>(null);
  const [showNotes, setShowNotes] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    control,
    formState: { errors, isValid },
  } = useForm<CreateNewsInput>({
    resolver: zodResolver(createNewsSchema),
    defaultValues: { source_url: "", transcribe_audio: false, notes: "" },
    mode: "onChange",
  });
  const notes = useWatch({ control, name: "notes" }) || "";

  async function submit(values: CreateNewsInput) {
    const result = await mutation.mutateAsync(values);
    navigate(`/noticias/${result.news_item_id}`);
  }

  async function pasteSourceUrl() {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) return toast.error("A área de transferência está vazia");
      const currentValue = getValues("source_url")?.trim();
      if (
        currentValue &&
        currentValue !== value &&
        !window.confirm("Substituir o link que já está preenchido?")
      )
        return;
      setValue("source_url", value, {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.success("Link colado");
    } catch {
      toast.error(
        "Permita o acesso à área de transferência ou cole manualmente",
      );
    }
  }

  function removeNotes() {
    setValue("notes", "", { shouldDirty: true, shouldValidate: true });
    setShowNotes(false);
    toast.success("Observação removida");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-20 md:space-y-6 md:pb-0">
      <div className="flex items-start gap-2 md:block">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 md:hidden"
          onClick={() => navigate(-1)}
          aria-label="Voltar"
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          className="hidden md:inline-flex"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft />
          Voltar
        </Button>
        <div className="min-w-0 pt-1 md:pt-0">
          <p className="hidden text-sm font-semibold text-primary md:block">
            Nova pauta
          </p>
          <h1 className="font-display text-2xl font-bold md:mt-1 md:text-3xl">
            <span className="md:hidden">Nova notícia</span>
            <span className="hidden md:inline">Processar notícia</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground md:mt-2">
            <span className="md:hidden">
              Cole o link da publicação para começar.
            </span>
            <span className="hidden md:inline">
              Cole a publicação original. O processamento continua mesmo se
              você sair desta tela.
            </span>
          </p>
        </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none md:border md:bg-card md:shadow-[0_1px_2px_rgba(15,23,42,.03),0_12px_40px_rgba(15,23,42,.04)]">
        <CardHeader className="hidden md:flex">
          <CardTitle>Link de origem</CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-5 md:pt-0">
          <form className="space-y-3 md:space-y-6" onSubmit={handleSubmit(submit)}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                URL da publicação
              </span>
              <span className="relative block">
                <Input
                  className="h-12 pr-14"
                  placeholder="https://instagram.com/reel/..."
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  {...register("source_url")}
                />
                <Button
                  className="absolute right-0.5 top-0.5 size-11"
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={pasteSourceUrl}
                  aria-label="Colar link da área de transferência"
                  title="Colar link"
                >
                  <ClipboardPaste size={19} />
                </Button>
              </span>
              {errors.source_url && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.source_url.message}
                </p>
              )}
            </label>

            <div className="rounded-xl border border-border/70 bg-card px-3 py-2 md:rounded-2xl md:bg-muted/30 md:p-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <AudioLines size={17} className="text-primary" />
                    Transcrever áudio
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="peer sr-only"
                  {...register("transcribe_audio")}
                />
                <span
                  aria-hidden="true"
                  className="relative h-7 w-12 shrink-0 rounded-full bg-muted-foreground/30 transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-2"
                />
              </label>
              <div className="flex items-center gap-1 pl-6">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
                  Usar quando o vídeo tiver informações importantes na fala.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  onClick={() => setInfoTopic("transcription")}
                  aria-label="Saiba mais sobre transcrição de áudio"
                >
                  <Info size={17} />
                </Button>
              </div>
            </div>

            <div>
              {!showNotes ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 px-2 text-primary"
                  onClick={() => setShowNotes(true)}
                >
                  <Plus size={18} />
                  {notes
                    ? "Editar observação adicionada"
                    : "Adicionar observações"}
                </Button>
              ) : (
                <div className="rounded-xl border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label
                      htmlFor="create-news-notes"
                      className="text-sm font-semibold"
                    >
                      Observações
                    </label>
                    {notes && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 text-destructive"
                        onClick={removeNotes}
                        aria-label="Remover observações"
                      >
                        <Trash2 size={18} />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    id="create-news-notes"
                    className="min-h-28"
                    placeholder="Contexto adicional, atenção a um fato, orientação de créditos..."
                    {...register("notes")}
                  />
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {notes.length}/2000 caracteres
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setShowNotes(false)}
                    >
                      {notes && <Check size={16} />}
                      {notes ? "Concluir" : "Fechar"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 rounded-xl bg-muted/35 py-1 pl-3 pr-1 text-xs text-muted-foreground">
              <Info size={16} className="shrink-0 text-primary" />
              <p className="min-w-0 flex-1">
                Categoria, destino e tom serão definidos automaticamente.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={() => setInfoTopic("automatic")}
                aria-label="Saiba mais sobre definições automáticas"
              >
                <Info size={17} />
              </Button>
            </div>

            <Button
              className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 h-12 w-auto shadow-xl md:static md:w-full md:shadow-sm"
              size="lg"
              disabled={!isValid || mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {mutation.isPending ? "Processando..." : "Processar notícia"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(infoTopic)}
        onOpenChange={(open) => {
          if (!open) setInfoTopic(null);
        }}
      >
        <DialogContent aria-describedby="create-info-description">
          <div className="space-y-3 p-5 pr-16">
            <DialogTitle>
              {infoTopic === "transcription"
                ? "Quando transcrever o áudio?"
                : "Definições automáticas"}
            </DialogTitle>
            <DialogDescription id="create-info-description">
              {infoTopic === "transcription"
                ? "Ative quando a fala do vídeo trouxer informações importantes que não aparecem na legenda. Quando estiver desativado, a notícia será criada usando a legenda original e o texto visível na mídia."
                : "Categoria, página de destino e tom editorial serão definidos automaticamente a partir do conteúdo da publicação e das configurações do sistema."}
            </DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
