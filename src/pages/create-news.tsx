import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  AudioLines,
  Check,
  ClipboardPaste,
  ImagePlus,
  LoaderCircle,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useCreateNews } from "@/hooks/use-data";
import { createNewsSchema, type CreateNewsInput } from "@/lib/schemas";

export function CreateNewsPage() {
  const navigate = useNavigate();
  const mutation = useCreateNews();
  const [showNotes, setShowNotes] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
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
  const sourceUrl = useWatch({ control, name: "source_url" }) || "";

  async function submit(values: CreateNewsInput) {
    const result = await mutation.mutateAsync({ ...values, media_file: mediaFile || undefined });
    navigate(`/noticias/${result.news_item_id}`);
  }

  function selectMedia(file?: File) {
    if (!file) return;
    const supported = /^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/;
    if (!supported.test(file.type)) return toast.error("Use uma imagem ou vídeo compatível");
    if (file.size > 200 * 1024 * 1024) return toast.error("A mídia deve ter no máximo 200 MB");
    setMediaFile(file);
    setValue("source_url", "", { shouldDirty: true, shouldValidate: true });
    toast.success("Mídia adicionada como fonte");
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
              Use um link ou uma mídia como fonte.
            </span>
            <span className="hidden md:inline">
              Use um link, uma imagem ou um vídeo como fonte.
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

            <div className="flex items-center gap-3" aria-label="Ou envie uma mídia">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">ou</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <input
              ref={mediaInputRef}
              type="file"
              className="sr-only"
              aria-label="Selecionar mídia de origem"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              onChange={(event) => selectMedia(event.target.files?.[0])}
            />
            {mediaFile ? (
              <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-card)] border bg-[var(--primary-subtle)] p-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-card text-primary"><ImagePlus size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{mediaFile.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{(mediaFile.size / 1024 / 1024).toFixed(1)} MB · fonte principal</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setMediaFile(null)} aria-label="Remover mídia"><X size={18} /></Button>
              </div>
            ) : (
              <div>
                <Button type="button" variant="outline" className="w-full" onClick={() => mediaInputRef.current?.click()}>
                  <ImagePlus size={18} /> Inserir mídia
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">JPG, PNG, WebP, MP4, WebM ou MOV · até 200 MB</p>
              </div>
            )}

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
                  disabled={Boolean(mediaFile)}
                />
                <span
                  aria-hidden="true"
                  className="relative h-7 w-12 shrink-0 rounded-full bg-muted-foreground/30 transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40 peer-focus-visible:ring-offset-2"
                />
              </label>
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

            <Button
              className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 h-12 w-auto shadow-xl md:static md:w-full md:shadow-sm"
              size="lg"
              disabled={(!mediaFile && (!isValid || !sourceUrl.trim())) || mutation.isPending}
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

    </div>
  );
}
