import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, Clipboard, Download, History, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useNewsItem, useUpdateNews } from '@/hooks/use-data'
import { supabase } from '@/lib/supabase'
import { statusLabels, type NewsStatus } from '@/lib/constants'

export function NewsDetailPage() {
  const { id } = useParams()
  const { data, isLoading, refetch } = useNewsItem(id)
  const update = useUpdateNews()
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState<{ field: 'title' | 'caption'; instruction: string; preview?: string } | null>(null)

  useEffect(() => {
    if (data) {
      // Query refreshes may deliver the generated content after processing completes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(data.generated_title ?? '')
      setCaption(data.generated_caption ?? '')
    }
  }, [data])

  useEffect(() => {
    const job = data?.processing_jobs?.[0]
    if (job && ['queued', 'running', 'retrying'].includes(job.status)) {
      const timer = setInterval(() => refetch(), 3000)
      return () => clearInterval(timer)
    }
  }, [data, refetch])

  if (isLoading) return <div className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-12 w-1/2"/><Skeleton className="h-80"/></div>
  if (!data) return <p>Notícia não encontrada.</p>
  const job = data.processing_jobs?.[0]

  async function save() {
    setSaving(true)
    try { await update.mutateAsync({ id: data.id, values: { generated_title: title, generated_caption: caption } }) }
    finally { setSaving(false) }
  }
  async function copy(text: string) { await navigator.clipboard.writeText(text); toast.success('Copiado para a área de transferência') }
  async function signedDownload() {
    const { data: result, error } = await supabase.functions.invoke('temporary-media-url', { body: { news_item_id: data.id } })
    if (error) return toast.error('A mídia não está mais disponível')
    window.open(result.url, '_blank')
  }
  async function revise() {
    if (!revision) return
    const { data: result, error } = await supabase.functions.invoke('revise-news-field', { body: { news_item_id: data.id, field: revision.field, instruction: revision.instruction } })
    if (error) toast.error('Não foi possível gerar a revisão')
    else setRevision({ ...revision, preview: result.preview })
  }
  function confirmRevision() {
    if (!revision?.preview) return
    if (revision.field === 'title') setTitle(revision.preview); else setCaption(revision.preview)
    setRevision(null)
    toast.info('Prévia aplicada. Salve para confirmar a substituição.')
  }
  async function retry() {
    const { error } = await supabase.functions.invoke('retry-processing-step', { body: { job_id: job?.id } })
    if (error) toast.error('Não foi possível retomar'); else { toast.success('Etapa retomada'); refetch() }
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge>{statusLabels[data.status as NewsStatus]}</Badge>{data.categories && <Badge variant="outline">{data.categories.name}</Badge>}</div><h1 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{title || 'Notícia em processamento'}</h1><p className="mt-2 break-all text-xs text-muted-foreground">{data.source_url}</p></div><div className="flex gap-2"><Button variant="outline" onClick={signedDownload} disabled={!data.temporary_media_path}><Download/>Baixar vídeo</Button><Button onClick={save} disabled={saving}><Check/>{saving ? 'Salvando...' : 'Salvar'}</Button></div></div>
    {job && job.status !== 'completed' && <Card className={job.status === 'failed' ? 'border-red-200 bg-red-50' : 'border-primary/20 bg-primary/5'}><CardContent className="p-5"><div className="flex items-start gap-3">{job.status === 'failed' ? <TriangleAlert className="text-red-600"/> : <LoaderCircle className="animate-spin text-primary"/>}<div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-semibold">{job.status === 'failed' ? 'Falha no processamento' : `Processando: ${job.current_step}`}</p><span className="text-sm font-bold">{job.progress}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10"><div className={job.status === 'failed' ? 'h-full bg-red-500' : 'h-full bg-primary'} style={{ width: `${job.progress}%` }}/></div>{job.error_message && <p className="mt-3 text-sm text-red-700">{job.error_message}</p>}{job.status === 'failed' && <Button className="mt-4" size="sm" onClick={retry}><RefreshCw/>Retomar esta etapa</Button>}</div></div></CardContent></Card>}
    <div className="grid gap-6 lg:grid-cols-2">{([['title', 'Título', title, setTitle], ['caption', 'Legenda', caption, setCaption]] as const).map(([field, label, value, setter]) => <Card key={field}><CardHeader className="flex-row items-center justify-between"><CardTitle>{label}</CardTitle><div className="flex"><Button variant="ghost" size="icon" onClick={() => copy(value)} aria-label={`Copiar ${label}`}><Clipboard/></Button><Button variant="ghost" size="icon" onClick={() => setRevision({ field, instruction: '' })} aria-label={`Alterar ${label} com IA`}><Sparkles/></Button></div></CardHeader><CardContent><Textarea className={field === 'caption' ? 'min-h-64' : 'min-h-28'} value={value} onChange={e => setter(e.target.value)}/><p className="mt-2 text-right text-xs text-muted-foreground">{value.length} caracteres</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History/>Fontes e rastreabilidade</CardTitle></CardHeader><CardContent className="grid gap-5 md:grid-cols-2"><Source title="Legenda original" value={data.source_caption}/><Source title="Transcrição" value={data.transcript}/><Source title="Texto detectado por OCR" value={data.ocr_text}/><Source title="Alertas da IA" value={data.ai_warnings?.join('\n')}/></CardContent></Card>
    {revision && <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center" onClick={() => setRevision(null)}><Card className="max-h-[88dvh] w-full overflow-y-auto rounded-b-none p-1 sm:max-w-lg sm:rounded-2xl" onClick={e => e.stopPropagation()}><CardHeader><CardTitle>Alterar {revision.field === 'title' ? 'título' : 'legenda'} com IA</CardTitle><p className="text-sm text-muted-foreground">A IA criará uma prévia. O texto só será substituído após sua confirmação.</p></CardHeader><CardContent className="space-y-4">{!revision.preview ? <><div className="flex flex-wrap gap-2">{['Deixe mais jornalístico', 'Deixe mais curto', 'Destaque o fato principal', 'Retire opiniões'].map(x => <button key={x} className="rounded-full border px-3 py-1.5 text-xs" onClick={() => setRevision({ ...revision, instruction: x })}>{x}</button>)}</div><Textarea value={revision.instruction} onChange={e => setRevision({ ...revision, instruction: e.target.value })} placeholder="Diga o que deseja mudar..."/><Button className="w-full" onClick={revise} disabled={!revision.instruction}><Sparkles/>Gerar prévia</Button></> : <><div className="rounded-xl bg-muted p-4 text-sm leading-relaxed whitespace-pre-wrap">{revision.preview}</div><div className="grid grid-cols-2 gap-3"><Button variant="outline" onClick={() => setRevision({ ...revision, preview: undefined })}><RefreshCw/>Tentar novamente</Button><Button onClick={confirmRevision}><Check/>Usar esta versão</Button></div></>}</CardContent></Card></div>}
  </div>
}

function Source({ title, value }: { title: string; value?: string | null }) { return <div><p className="text-sm font-semibold">{title}</p><p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">{value || 'Não disponível'}</p></div> }
