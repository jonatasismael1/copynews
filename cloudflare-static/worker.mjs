const functions=new Set(['instagram-auth-start','instagram-callback','instagram-media-proxy']);
export default{async fetch(request,env){
 const url=new URL(request.url);let name=null;
 if(url.pathname==='/auth/instagram/callback')name='instagram-callback';
 else if(url.pathname.startsWith('/.netlify/functions/'))name=url.pathname.slice('/.netlify/functions/'.length);
 if(name!==null){
  if(!functions.has(name))return new Response(null,{status:404});
  const target=new URL('https://copynews-api.dbe.digital/.netlify/functions/'+name);target.search=url.search;
  const headers=new Headers(request.headers);headers.delete('Host');
  const response=await fetch(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
  const outgoing=new Headers(response.headers),location=outgoing.get('Location');
  if(location){const redirect=new URL(location,target);if(redirect.hostname==='copynews.netlify.app'){redirect.hostname='copynews.dbe.digital';redirect.protocol='https:';outgoing.set('Location',redirect.href)}}
  return new Response(response.body,{status:response.status,headers:outgoing});
 }
 return env.ASSETS.fetch(request);
}};
