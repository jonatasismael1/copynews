import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, FileText, LoaderCircle, Pencil, Plus, Search, Send, Trash2, UserRound, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, PageHeader } from "@/components/ui/patterns";
import { useDistribution, useManageDistributionRecipient, useNews, useSendNews } from "@/hooks/use-data";
import type { DistributionRecipient, NewsItem, NewsSendHistory } from "@/lib/database.types";
import { useAuth } from "@/providers/auth-provider";

const emptyForm = { name: "", vehicle: "", phone: "", is_active: true };
const statusMeta = {
  success: { label: "Enviado", icon: CheckCircle2, variant: "success" as const },
  partial: { label: "Parcial", icon: Clock3, variant: "warning" as const },
  failed: { label: "Falhou", icon: XCircle, variant: "danger" as const },
  sending: { label: "Enviando", icon: LoaderCircle, variant: "secondary" as const },
};
function maskPhone(phone: string) { return phone.replace(/^(55)(\d{2})(\d{5})(\d{4})$/, "+$1 ($2) $3-$4"); }
function titleOf(news: NewsItem) { return news.original_title || news.generated_title || "Notícia sem título"; }
function when(value: string) {
  const date = new Date(value); const today = new Date();
  const day = date.toLocaleDateString("pt-BR") === today.toLocaleDateString("pt-BR") ? "Hoje" : date.toLocaleDateString("pt-BR");
  return `${day} • ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function SendPage() {
  const { profile } = useAuth();
  const { data, isLoading } = useDistribution();
  const { data: news = [], isLoading: newsLoading } = useNews();
  const manage = useManageDistributionRecipient();
  const sender = useSendNews();
  const [recipient, setRecipient] = useState<DistributionRecipient | null>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [search, setSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<DistributionRecipient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [historyItem, setHistoryItem] = useState<NewsSendHistory | null>(null);
  const activeRecipients = data?.recipients.filter((item) => item.is_active) || [];
  const filteredNews = useMemo(() => news.filter((item) => `${titleOf(item)} ${item.source_url}`.toLowerCase().includes(search.toLowerCase())).slice(0, 50), [news, search]);

  function openForm(item?: DistributionRecipient) {
    setEditing(item || null);
    setForm(item ? { name: item.name, vehicle: item.vehicle, phone: item.phone, is_active: item.is_active } : emptyForm);
    setManageOpen(true);
  }
  async function saveRecipient() {
    if (!form.name.trim() || !form.vehicle.trim() || !/^55\d{10,11}$/.test(form.phone.replace(/\D/g, ""))) return toast.error("Preencha nome, veículo e telefone E.164");
    await manage.mutateAsync({ action: editing ? "update" : "create", ...(editing ? { id: editing.id } : {}), ...form, phone: form.phone.replace(/\D/g, "") });
    toast.success(editing ? "Destinatário atualizado" : "Destinatário adicionado"); setManageOpen(false);
  }
  async function removeRecipient(item: DistributionRecipient) {
    if (!window.confirm(`Excluir ${item.name}? O histórico existente será preservado.`)) return;
    await manage.mutateAsync({ action: "delete", id: item.id }); toast.success("Destinatário excluído");
  }
  async function confirmSend(forceResend = false) {
    if (!recipient || !selectedNews) return;
    const previous = data?.history.find((item) => item.recipient_id === recipient.id && item.news_id === selectedNews.id && ["success", "partial", "sending"].includes(item.status));
    if (previous && !forceResend) {
      const confirmed = window.confirm(`Esta notícia já foi enviada para ${recipient.name} às ${new Date(previous.sent_at || previous.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Deseja enviar novamente?`);
      if (!confirmed) return; return confirmSend(true);
    }
    try {
      const result = await sender.mutateAsync({ newsId: selectedNews.id, recipientId: recipient.id, forceResend });
      if (result.status === "success") toast.success(`Notícia enviada para ${recipient.name}.`);
      else if (result.status === "partial") toast.warning(`Envio para ${recipient.name} concluído parcialmente.`);
      else toast.error("Não foi possível concluir o envio.");
      setRecipient(null); setSelectedNews(null); setSearch("");
    } catch { toast.error("Não foi possível concluir o envio."); }
  }

  return <div className="page-container space-y-6">
    <PageHeader eyebrow="Distribuição" title="Enviar" description="Entregue o conteúdo original para sua equipe pelo WhatsApp, em qualidade preservada." action={profile?.role === "admin" ? <Button variant="outline" onClick={() => openForm()}><Plus />Novo destinatário</Button> : undefined} />
    <section>
      <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Destinatários</h2><span className="text-xs text-muted-foreground">{activeRecipients.length} ativos</span></div>
      {isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted" />)}</div> : activeRecipients.length === 0 ? <Card><EmptyState icon={UserRound} title="Nenhum destinatário ativo" description="Cadastre uma pessoa para começar a distribuir notícias." /></Card> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{activeRecipients.map((item) => <Card key={item.id} className="transition-colors hover:border-primary/30"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div className="grid size-10 place-items-center rounded-xl bg-primary/10 font-display font-bold text-primary">{item.name.charAt(0)}</div>{profile?.role === "admin" && <div className="flex"><Button variant="ghost" size="icon" onClick={() => openForm(item)} aria-label={`Editar ${item.name}`}><Pencil size={16}/></Button><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => removeRecipient(item)} aria-label={`Excluir ${item.name}`}><Trash2 size={16}/></Button></div>}</div><h3 className="mt-3 font-display font-semibold">{item.name}</h3><p className="mt-0.5 text-sm text-muted-foreground">{item.vehicle}</p><p className="mt-1 text-xs text-muted-foreground">{maskPhone(item.phone)}</p><Button className="mt-4 w-full" onClick={() => { setRecipient(item); setSelectedNews(null); }}><Plus />Adicionar notícia</Button></CardContent></Card>)}</div>}
    </section>
    <section><h2 className="mb-3 font-display text-lg font-semibold">Envios recentes</h2><Card>{!data?.history.length ? <EmptyState icon={Send} title="Nenhum envio realizado" description="Os envios aparecerão aqui sem armazenar cópias da mídia." /> : <div className="divide-y">{data.history.slice(0, 20).map((item) => { const meta=statusMeta[item.status]; const Icon=meta.icon; return <button key={item.id} type="button" onClick={() => setHistoryItem(item)} className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-muted/60"><Icon size={20} className={item.status === "success" ? "text-emerald-600" : item.status === "failed" ? "text-destructive" : "text-amber-600"}/><div className="min-w-0 flex-1"><p className="font-semibold">{item.recipient_name}</p><p className="truncate text-xs text-muted-foreground">{item.recipient_vehicle} • {item.news_title || "Notícia sem título"}</p></div><div className="shrink-0 text-right"><Badge variant={meta.variant}>{meta.label}</Badge><p className="mt-1 text-[11px] text-muted-foreground">{when(item.sent_at || item.created_at)}</p></div></button>; })}</div>}</Card></section>

    <Dialog open={Boolean(recipient)} onOpenChange={(open) => { if (!open && !sender.isPending) { setRecipient(null); setSelectedNews(null); } }}><DialogContent className="sm:max-w-2xl"><div className="p-5 sm:p-6"><DialogTitle>Adicionar notícia para {recipient?.name}</DialogTitle><DialogDescription>{recipient?.vehicle}</DialogDescription><div className="relative mt-5"><Search className="absolute left-3 top-3.5 text-muted-foreground" size={17}/><Input className="pl-10" placeholder="Buscar por título ou URL..." value={search} onChange={(e) => setSearch(e.target.value)}/></div><div className="mt-3 max-h-[46dvh] space-y-2 overflow-y-auto">{newsLoading ? <LoaderCircle className="mx-auto my-10 animate-spin text-primary"/> : filteredNews.map((item) => <button key={item.id} type="button" onClick={() => setSelectedNews(item)} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedNews?.id === item.id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}><div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted"><FileText size={20} className="text-muted-foreground"/></div><div className="min-w-0"><p className="line-clamp-2 text-sm font-semibold">{titleOf(item)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.source_platform || "Origem"} • {new Date(item.created_at).toLocaleDateString("pt-BR")}</p><p className="truncate text-[11px] text-muted-foreground">{item.source_url}</p></div></button>)}</div>{selectedNews && <div className="mt-4 rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">Enviar esta notícia para {recipient?.name}?</p><p className="mt-1 line-clamp-2 text-sm font-semibold">{titleOf(selectedNews)}</p></div>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" disabled={sender.isPending} onClick={() => setRecipient(null)}>Cancelar</Button><Button disabled={!selectedNews || sender.isPending} onClick={() => confirmSend()}>{sender.isPending ? <><LoaderCircle className="animate-spin"/>Enviando...</> : <><Send/>Enviar</>}</Button></div></div></DialogContent></Dialog>

    <Dialog open={manageOpen} onOpenChange={setManageOpen}><DialogContent><div className="p-5 sm:p-6"><DialogTitle>{editing ? "Editar destinatário" : "Novo destinatário"}</DialogTitle><DialogDescription>Use o telefone completo com DDI e DDD.</DialogDescription><div className="mt-5 space-y-3"><label className="block text-sm font-medium">Nome<Input className="mt-1" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></label><label className="block text-sm font-medium">Veículo<Input className="mt-1" value={form.vehicle} onChange={(e)=>setForm({...form,vehicle:e.target.value})}/></label><label className="block text-sm font-medium">Telefone<Input className="mt-1" inputMode="numeric" placeholder="5582999999999" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e)=>setForm({...form,is_active:e.target.checked})}/>Destinatário ativo</label></div><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={()=>setManageOpen(false)}>Cancelar</Button><Button disabled={manage.isPending} onClick={saveRecipient}>{manage.isPending ? "Salvando..." : "Salvar"}</Button></div></div></DialogContent></Dialog>

    <Dialog open={Boolean(historyItem)} onOpenChange={(open)=>!open&&setHistoryItem(null)}><DialogContent><div className="p-5 sm:p-6"><DialogTitle>Detalhes do envio</DialogTitle>{historyItem && <div className="mt-5 space-y-3 text-sm"><div><p className="text-xs text-muted-foreground">Destinatário</p><p className="font-semibold">{historyItem.recipient_name} • {historyItem.recipient_vehicle}</p></div><div><p className="text-xs text-muted-foreground">Notícia</p><p className="font-semibold">{historyItem.news_title || "Notícia sem título"}</p></div><a href={historyItem.source_url} target="_blank" rel="noreferrer" className="block break-all text-primary underline">{historyItem.source_url}</a><div className="flex items-center justify-between"><Badge variant={statusMeta[historyItem.status].variant}>{statusMeta[historyItem.status].label}</Badge><span className="text-xs text-muted-foreground">{when(historyItem.sent_at || historyItem.created_at)}</span></div>{historyItem.error_message && <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{historyItem.error_message}</p>}</div>}</div></DialogContent></Dialog>
  </div>;
}
