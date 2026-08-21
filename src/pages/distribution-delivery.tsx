import { useEffect, useState } from "react";
import { CheckCircle2, Clipboard, Download, ExternalLink, LoaderCircle, Newspaper } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type Delivery = { title:string; caption:string; source_url:string; source_author:string|null; sender_name:string; recipient_name:string; recipient_vehicle:string; created_at:string; media:{url:string;name:string;kind:"video"|"image"}[]; media_expired:boolean; recipient_confirmed_at:string|null };
export function DistributionDeliveryPage() {
  const { deliverySlug } = useParams(); const [data,setData]=useState<Delivery|null>(null); const [error,setError]=useState(""); const [confirming,setConfirming]=useState(false);
  useEffect(()=>{ supabase.functions.invoke("distribution-delivery",{body:{slug:deliverySlug}}).then(({data:result,error:e})=>{if(e||!result?.title) throw e; setData(result)}).catch(()=>setError("Este link não existe ou não está mais disponível.")); },[deliverySlug]);
  const copy=async(value:string,label:string)=>{await navigator.clipboard.writeText(value);toast.success(`${label} copiado`)};
  const confirmPublished=async()=>{if(!data||data.recipient_confirmed_at||!window.confirm(`Confirmar que ${data.recipient_name} publicou este conteúdo?`))return;setConfirming(true);const{data:result,error:e}=await supabase.functions.invoke("distribution-delivery",{body:{action:"confirm_published",slug:deliverySlug}});setConfirming(false);if(e||!result?.confirmed)return toast.error("Não foi possível registrar a publicação");setData({...data,recipient_confirmed_at:result.confirmed_at});toast.success("Publicação registrada no Copy News")};
  if(error)return <main className="grid min-h-dvh place-items-center p-6 text-center"><div><h1 className="font-display text-2xl font-bold">Link indisponível</h1><p className="mt-2 text-muted-foreground">{error}</p></div></main>;
  if(!data)return <main className="grid min-h-dvh place-items-center"><LoaderCircle className="animate-spin text-primary"/></main>;
  return <main className="min-h-dvh bg-muted/30 p-4 md:p-8"><div className="mx-auto max-w-3xl space-y-4">
    <header className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Newspaper/></span><div><p className="font-display text-xl font-bold">Copy News</p><p className="text-sm text-muted-foreground">Conteúdo enviado por {data.sender_name} para {data.recipient_name}</p></div></header>
    <Card><CardHeader><CardTitle className="text-2xl">{data.title}</CardTitle></CardHeader><CardContent className="space-y-5">
      {data.caption&&<p className="whitespace-pre-wrap leading-7">{data.caption}</p>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>copy(data.title,"Título")}><Clipboard/>Copiar título</Button><Button variant="outline" onClick={()=>copy(data.caption,"Legenda")} disabled={!data.caption}><Clipboard/>Copiar legenda</Button><Button variant="outline" onClick={()=>copy(`${data.title}\n\n${data.caption}`.trim(),"Título e legenda")}><Clipboard/>Copiar os dois</Button></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Mídia original</CardTitle></CardHeader><CardContent className="space-y-3">{data.media.map((item,index)=><div key={item.url} className="space-y-2">{item.kind==="video"?<video controls preload="metadata" className="max-h-[560px] w-full rounded-xl bg-black" src={item.url}/>:<img className="max-h-[560px] w-full rounded-xl object-contain bg-muted" src={item.url} alt={`Mídia ${index+1}`}/>}<Button asChild className="w-full"><a href={item.url} download={item.name}><Download/>Baixar {data.media.length>1?`mídia ${index+1}`:"notícia original"}</a></Button></div>)}{!data.media.length&&<p className="text-sm text-muted-foreground">Não foi possível disponibilizar a mídia. O link original continua acessível abaixo.</p>}</CardContent></Card>
    <Button asChild variant="outline" className="w-full"><a href={data.source_url} target="_blank" rel="noreferrer"><ExternalLink/>Abrir publicação original</a></Button>
    <Card><CardContent className="space-y-3 p-5">{data.recipient_confirmed_at?<div className="flex items-center gap-3 text-primary"><CheckCircle2/><div><p className="font-semibold">Publicação confirmada</p><p className="text-sm text-muted-foreground">Registrada para {data.recipient_name} em {new Date(data.recipient_confirmed_at).toLocaleString("pt-BR")}</p></div></div>:<><p className="font-semibold">Já publicou este conteúdo?</p><p className="text-sm text-muted-foreground">Ao confirmar, o Copy News registrará que {data.recipient_name} realizou a publicação.</p><Button className="w-full" onClick={confirmPublished} disabled={confirming}>{confirming?<LoaderCircle className="animate-spin"/>:<CheckCircle2/>}Marcar como publicado</Button></>}</CardContent></Card>
  </div></main>;
}
