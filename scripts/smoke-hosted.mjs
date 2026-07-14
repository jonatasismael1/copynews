import { createClient } from '@supabase/supabase-js'
const {SUPABASE_URL:url,SUPABASE_SECRET_KEY:secret,SUPABASE_PUBLISHABLE_KEY:publishable,INITIAL_ADMIN_PASSWORD:password}=process.env
const admin=createClient(url,secret,{auth:{persistSession:false}}),client=createClient(url,publishable,{auth:{persistSession:false}})
const login=await client.auth.signInWithPassword({email:'admin@copynews.local',password});if(login.error)throw login.error
const created=[]
try{
  const tempEmail=`edge-${Date.now()}@copynews.local`
  const userResult=await client.functions.invoke('admin-users',{body:{action:'create',name:'Teste Edge Function',email:tempEmail,password:'Temp#Copy2026!Aa',role:'viewer',daily_goal:0}});if(userResult.error)throw userResult.error;created.push(['user',userResult.data.id])
  const queued=await client.functions.invoke('process-source-url',{body:{source_url:'https://www.instagram.com/reel/DYvbjoLAeBx/',editorial_tone:'Jornalístico'}});if(queued.error)throw queued.error;created.push(['news',queued.data.news_item_id])
  const revisionNews=await admin.from('news_items').insert({source_url:'https://example.com/source',source_platform:'web',source_caption:'A prefeitura inaugurou uma escola municipal nesta segunda-feira.',generated_title:'Prefeitura inaugura escola',generated_caption:'Uma nova escola foi inaugurada.',status:'draft',created_by:login.data.user.id}).select().single();if(revisionNews.error)throw revisionNews.error;created.push(['news',revisionNews.data.id])
  const revised=await client.functions.invoke('revise-news-field',{body:{news_item_id:revisionNews.data.id,field:'title',instruction:'Deixe mais direto'}});if(revised.error||!revised.data.preview)throw revised.error||new Error('AI revision missing')
  const publication=await client.functions.invoke('create-publication',{body:{title:'Teste de publicação externa',platform:'Instagram',published_url:`https://instagram.com/p/test-${Date.now()}`,published_at:new Date().toISOString()}});if(publication.error)throw publication.error;created.push(['publication',publication.data.id])
  const metrics=await client.functions.invoke('record-metrics',{body:{publication_id:publication.data.id,captured_at:new Date().toISOString(),views:100,reach:80,impressions:120,likes:10,comments:2,shares:3,saves:4,clicks:1,followers_gained:0}});if(metrics.error)throw metrics.error
  const dashboard=await client.rpc('dashboard_summary',{p_from:null,p_to:null});if(dashboard.error||Number(dashboard.data.publications)<1)throw dashboard.error||new Error('Dashboard did not count publication')
  console.log(JSON.stringify({ok:true,checks:['admin Edge Function','authenticated enqueue','OpenRouter revision','external publication','metric snapshot','America/Maceio dashboard'],job_id:queued.data.job_id}))
}finally{
  for(const[type,id]of created.reverse()){if(type==='user')await admin.auth.admin.deleteUser(id);if(type==='news')await admin.from('news_items').delete().eq('id',id);if(type==='publication')await admin.from('publications').delete().eq('id',id)}
}
