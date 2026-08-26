import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const env=(name:string)=>Deno.env.get(name)?.trim().replace(/^['"]|['"]$/g,"")||"";
const safe=(error:unknown)=>error instanceof Error?error.message.slice(0,180):"Indisponível";

async function probe(url:string,headers:Record<string,string>={}){
  if(!url)return {status:"not_configured"};
  const started=Date.now();
  try{
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(5000)});
    const data=await response.json().catch(()=>null);
    return {status:response.ok?"ok":"error",http_status:response.status,latency_ms:Date.now()-started,data};
  }catch(error){return {status:"error",latency_ms:Date.now()-started,error:safe(error)};}
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  try{
    const url=env("SUPABASE_URL");
    const auth=createClient(url,env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:req.headers.get("authorization")||""}}});
    const {data:{user}}=await auth.auth.getUser();
    if(!user)throw new Error("Unauthorized");
    const admin=createClient(url,env("SUPABASE_SECRET_KEY")||env("SUPABASE_SERVICE_ROLE_KEY"));
    const {data:member}=await admin.from("profiles").select("role,is_active,organization_id").eq("id",user.id).single();
    if(!member?.is_active||member.role!=="admin")throw new Error("Forbidden");
    const since=new Date(Date.now()-24*3600_000).toISOString();
    const [jobs,previews,runs,reports,accounts,alerts,storage,worker,instagram,evolution,recentJobs,retention,backup,corrections]=await Promise.all([
      admin.from("processing_jobs").select("status",{count:"exact"}).in("status",["queued","running","retrying"]),
      admin.from("distribution_direct_previews").select("status",{count:"exact"}).in("status",["queued","processing"]),
      admin.from("instagram_collection_runs").select("status,error,started_at,finished_at,notification_status").order("started_at",{ascending:false}).limit(1).maybeSingle(),
      admin.from("daily_publication_report_runs").select("status,sent_at,error_message,report_date").order("report_date",{ascending:false}).limit(1).maybeSingle(),
      admin.from("connected_accounts").select("status,needs_attention,token_expires_at"),
      admin.from("distribution_operational_alerts").select("id",{count:"exact",head:true}).eq("organization_id",member.organization_id).eq("status","open"),
      admin.schema("storage").from("objects").select("metadata").gte("created_at",since).limit(5000),
      probe(env("WORKER_HEALTH_URL")),
      probe(`${env("INSTAGRAM_ANALYTICS_API_URL").replace(/\/$/,"")}/health`),
      probe(`${env("EVOLUTION_API_URL").replace(/\/$/,"")}/instance/connectionState/${env("EVOLUTION_INSTANCE")}`,{"apikey":env("EVOLUTION_API_KEY")}),
      admin.from("processing_jobs").select("status,started_at,finished_at,news_items(ocr_confidence)").gte("created_at",since),
      admin.from("retention_cleanup_runs").select("status,started_at,finished_at,error_message,removed_media,deleted_rows").order("started_at",{ascending:false}).limit(1).maybeSingle(),
      admin.from("database_backup_runs").select("status,started_at,finished_at,restore_verified_at,size_bytes,error_message").order("started_at",{ascending:false}).limit(1).maybeSingle(),
      admin.from("news_title_corrections").select("id",{count:"exact",head:true}).eq("organization_id",member.organization_id).gte("created_at",since),
    ]);
    const storageBytes=(storage.data||[]).reduce((sum,item)=>sum+Number((item.metadata as Record<string,unknown>|null)?.size||0),0);
    const completed=(recentJobs.data||[]).filter(item=>item.status==="completed"&&item.started_at&&item.finished_at);
    const durations=completed.map(item=>new Date(item.finished_at!).getTime()-new Date(item.started_at!).getTime()).filter(value=>value>=0);
    const failed=(recentJobs.data||[]).filter(item=>item.status==="failed").length;
    const lowConfidence=(recentJobs.data||[]).filter(item=>Number((item.news_items as {ocr_confidence?:number|null}|null)?.ocr_confidence??1)<0.72).length;
    const overall=[worker,instagram,evolution].some(item=>item.status==="error")?"critical":failed||lowConfidence?"warning":"ok";
    const queues={editorial:jobs.count||0,distribution:previews.count||0,open_alerts:alerts.count||0};
    const storageSummary={new_files_24h:storage.data?.length||0,new_bytes_24h:storageBytes};
    await admin.from("system_health_snapshots").insert({organization_id:member.organization_id,overall_status:overall,services:{worker,instagram,evolution},queues,storage:storageSummary});
    return json({checked_at:new Date().toISOString(),database:{status:"ok"},overall_status:overall,worker,instagram,evolution,queues,last_instagram_run:runs.data,last_daily_report:reports.data,instagram_accounts:{total:accounts.data?.length||0,attention:accounts.data?.filter(item=>item.needs_attention||item.status!=="connected").length||0},storage:storageSummary,processing_24h:{total:recentJobs.data?.length||0,completed:completed.length,failed,low_confidence:lowConfidence,average_seconds:durations.length?Math.round(durations.reduce((sum,value)=>sum+value,0)/durations.length/1000):0,corrections:corrections.count||0},retention:retention.data,backup:backup.data});
  }catch(error){const message=safe(error);return json({error:message},message==="Unauthorized"?401:message==="Forbidden"?403:500);}
});
