import http from'node:http';import{Readable}from'node:stream';
const names=['instagram-auth-start','instagram-callback','instagram-media-proxy'];let active=0;
export async function dispatch(req){
 const url=new URL(req.url);if(url.pathname==='/healthz')return Response.json({status:'ok',functions:names.length,source:process.env.DBE_SOURCE_COMMIT||'prepared'});
 const name=url.pathname.replace(/^\/\.netlify\/functions\//,'');if(!names.includes(name))return new Response(null,{status:404});
 const mod=await import('../../netlify/functions/'+name+'.mjs');
 const reply=await mod.handler({httpMethod:req.method,rawUrl:req.url,headers:Object.fromEntries(req.headers),queryStringParameters:Object.fromEntries(url.searchParams),body:['GET','HEAD'].includes(req.method)?null:await req.text(),isBase64Encoded:false});
 return new Response(reply.isBase64Encoded?Buffer.from(reply.body||'','base64'):reply.body||null,{status:reply.statusCode,headers:reply.headers});
}
export function createServer(){return http.createServer(async(req,res)=>{
 if(req.url!=='/healthz'&&(req.headers.host||'').split(':')[0]!=='copynews-api.dbe.digital'){res.writeHead(421);res.end();return}
 if(active>=4){res.writeHead(503);res.end();return}active++;
 try{
  let bytes=0;const chunks=[];for await(const part of req){bytes+=part.length;if(bytes>262144){res.writeHead(413);res.end();return}chunks.push(part)}
  const request=new Request('https://copynews-api.dbe.digital'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
  const response=await dispatch(request);res.writeHead(response.status,Object.fromEntries(response.headers));if(response.body&&req.method!=='HEAD')Readable.fromWeb(response.body).pipe(res);else res.end();
 }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"runtime_unavailable"}')}
 finally{active--}
})}
