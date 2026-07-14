import { createClient } from '@supabase/supabase-js'
const {SUPABASE_URL:url,SUPABASE_SECRET_KEY:secret,SUPABASE_PUBLISHABLE_KEY:publishable,INITIAL_ADMIN_PASSWORD:password}=process.env
const admin=createClient(url,secret,{auth:{persistSession:false}}),client=createClient(url,publishable,{auth:{persistSession:false}})
const login=await client.auth.signInWithPassword({email:'admin@copynews.local',password});if(login.error)throw login.error
let newsId,mediaPath
try{
  const queued=await client.functions.invoke('process-source-url',{body:{source_url:'https://www.youtube.com/shorts/-8zfGpA6sxo',editorial_tone:'Jornalístico, claro e direto'}});if(queued.error)throw queued.error;newsId=queued.data.news_item_id
  const deadline=Date.now()+8*60_000
  while(Date.now()<deadline){await new Promise(r=>setTimeout(r,5000));const job=await admin.from('processing_jobs').select('*').eq('id',queued.data.job_id).single();if(job.error)throw job.error;if(job.data.status==='failed')throw new Error(`Pipeline failed at ${job.data.current_step}: ${job.data.error_code} ${job.data.error_message}`);if(job.data.status==='completed'){const news=await admin.from('news_items').select('*').eq('id',newsId).single();if(news.error)throw news.error;mediaPath=news.data.temporary_media_path;if(!news.data.transcript)throw new Error('Missing real transcript');if(!news.data.generated_title||!news.data.generated_caption)throw new Error('Missing generated copy');if(news.data.ocr_text===null)throw new Error('OCR was not executed');console.log(JSON.stringify({ok:true,job_id:job.data.id,transcript_chars:news.data.transcript.length,ocr_chars:news.data.ocr_text.length,title_chars:news.data.generated_title.length,confidence:news.data.ai_confidence,media_temporary:Boolean(mediaPath)}));break}}
  if(Date.now()>=deadline)throw new Error('Pipeline timeout')
}finally{if(mediaPath)await admin.storage.from('temporary-media').remove([mediaPath]);if(newsId)await admin.from('news_items').delete().eq('id',newsId)}
