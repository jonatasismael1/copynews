import { useEffect, useState } from "react";
import { Clipboard, Download, ExternalLink, LoaderCircle } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import {
  isAppleMobile,
  prepareMediaFile,
  savePreparedMedia,
} from "@/lib/media-download";

type SharedNews = {
  generated_title: string | null;
  generated_caption: string | null;
  highlight: string | null;
  editorial_tone: string | null;
  summary: string | null;
  source_url: string;
  source_author: string | null;
  source_caption: string | null;
  transcript: string | null;
  ocr_text: string | null;
  ai_confidence: string | null;
  ai_warnings: string[];
  detected_facts: string[];
  download_url: string | null;
  publications: { platform: string; published_url: string; published_at: string }[];
};

export function SharedNewsPage() {
  const { shareSlug } = useParams();
  const [data, setData] = useState<SharedNews | null>(null);
  const [error, setError] = useState("");
  const [preparedMedia, setPreparedMedia] = useState<File | null>(null);
  const [preparingMedia, setPreparingMedia] = useState(false);
  useEffect(() => {
    supabase.functions
      .invoke("share-news", { body: { action: "read", slug: shareSlug } })
      .then(({ data: result, error: requestError }) => {
        if (requestError) throw requestError;
        setData(result as SharedNews);
      })
      .catch(() => setError("Este link não existe ou deixou de ser compartilhado."));
  }, [shareSlug]);

  useEffect(() => {
    if (!data?.download_url || !isAppleMobile()) return;
    let cancelled = false;
    prepareMediaFile(data.download_url, "copy-news")
      .then((file) => {
        if (!cancelled) setPreparedMedia(file);
      })
      .catch(() => {
        if (!cancelled) setPreparedMedia(null);
      })
      .finally(() => {
        if (!cancelled) setPreparingMedia(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.download_url]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  }

  async function saveMedia() {
    if (!data?.download_url) return;
    setPreparingMedia(true);
    try {
      const file =
        preparedMedia ||
        (await prepareMediaFile(data.download_url, "copy-news"));
      setPreparedMedia(file);
      await savePreparedMedia(file, data.download_url);
    } catch (saveError) {
      if (saveError instanceof DOMException && saveError.name === "AbortError")
        return;
      toast.error("Não foi possível salvar a mídia");
    } finally {
      setPreparingMedia(false);
    }
  }

  if (error)
    return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><h1 className="font-display text-2xl font-bold">Link indisponível</h1><p className="mt-2 text-muted-foreground">{error}</p></div></main>;
  if (!data)
    return <main className="grid min-h-dvh place-items-center"><LoaderCircle className="animate-spin text-primary" /></main>;
  return (
    <main className="min-h-dvh bg-muted/30 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-3xl bg-sidebar p-6 text-white shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Copy News</p>
          <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-4xl">{data.generated_title || "Notícia compartilhada"}</h1>
          {data.generated_title && <p className="mt-2 text-xs text-white/65">{data.generated_title.length} caracteres</p>}
          {data.highlight && <p className="mt-4 inline-flex rounded-full bg-emerald-300 px-3 py-1 text-sm font-bold text-slate-950">{data.highlight} · {data.highlight.length} caracteres</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {data.generated_title && <Button onClick={() => copy(data.generated_title!, "Título")}><Clipboard /> Copiar título</Button>}
            {data.generated_caption && <Button variant="secondary" onClick={() => copy(data.generated_caption!, "Legenda")}><Clipboard /> Copiar legenda</Button>}
            {data.download_url && <Button className="border-white/30 bg-white text-slate-900 hover:bg-slate-100 hover:text-slate-950" variant="outline" onClick={saveMedia} disabled={preparingMedia}>{preparingMedia ? <LoaderCircle className="animate-spin" /> : <Download />} {isAppleMobile() ? "Salvar na galeria" : "Baixar mídia"}</Button>}
          </div>
        </div>
        <SharedField title="Legenda gerada" value={data.generated_caption} onCopy={copy} />
        <div className="grid gap-5 md:grid-cols-2">
          <SharedField title="Resumo" value={data.summary} onCopy={copy} />
          <SharedField title="Legenda original" value={data.source_caption} onCopy={copy} />
          <SharedField title="Transcrição" value={data.transcript} onCopy={copy} />
          <SharedField title="Texto identificado na imagem" value={data.ocr_text} onCopy={copy} />
        </div>
        <Card>
          <CardHeader><CardTitle>Fonte</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.source_author && <p className="text-sm text-muted-foreground">Crédito: {data.source_author}</p>}
            <a className="inline-flex max-w-full items-center gap-2 break-all text-sm text-primary hover:underline" href={data.source_url} target="_blank" rel="noreferrer">Abrir conteúdo original <ExternalLink size={16} /></a>
            {data.publications?.map((publication) => <a key={publication.published_url} className="flex items-center gap-2 text-sm text-primary hover:underline" href={publication.published_url} target="_blank" rel="noreferrer">Ver no {publication.platform} <ExternalLink size={16} /></a>)}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SharedField({ title, value, onCopy }: { title: string; value: string | null; onCopy: (value: string, label: string) => void }) {
  if (!value) return null;
  return <Card><CardHeader className="flex-row items-center justify-between gap-3"><CardTitle>{title}</CardTitle><Button size="icon" variant="ghost" aria-label={`Copiar ${title}`} onClick={() => onCopy(value, title)}><Clipboard size={17} /></Button></CardHeader><CardContent><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{value}</p><p className="mt-3 text-right text-xs text-muted-foreground">{value.length} caracteres</p></CardContent></Card>;
}
