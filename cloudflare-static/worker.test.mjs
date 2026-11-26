import test from'node:test';import assert from'node:assert/strict';import worker from'./worker.mjs';
test('only the three API paths are proxied to the fixed owned VPS origin',async()=>{
 let target,options;globalThis.fetch=async(url,init)=>{target=new URL(url);options=init;return new Response(null,{status:401})};
 const r=await worker.fetch(new Request('https://copynews.dbe.digital/.netlify/functions/instagram-auth-start',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:'{}'}),{});
 assert.equal(r.status,401);assert.equal(target.origin,'https://copynews-api.dbe.digital');assert.equal(target.pathname,'/.netlify/functions/instagram-auth-start');assert.equal(options.headers.get('Authorization'),'Bearer synthetic');assert.equal(options.redirect,'manual');
 assert.equal((await worker.fetch(new Request('https://copynews.dbe.digital/.netlify/functions/unknown'),{})).status,404);
});
test('registered legacy OAuth callback preserves query and returns the user to the new app',async()=>{
 let target;globalThis.fetch=async(url)=>{target=new URL(url);return new Response(null,{status:302,headers:{Location:'https://copynews.netlify.app/configuracoes?instagram=connected'}})};
 const r=await worker.fetch(new Request('https://copynews.dbe.digital/auth/instagram/callback?code=synthetic&state=fixture'),{});
 assert.equal(target.pathname,'/.netlify/functions/instagram-callback');assert.equal(target.searchParams.get('state'),'fixture');assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://copynews.dbe.digital/configuracoes?instagram=connected');
});
test('static pages are served as assets without an API invocation',async()=>{let assets=0;const r=await worker.fetch(new Request('https://copynews.dbe.digital/'),{ASSETS:{fetch:async()=>{assets++;return new Response('synthetic-static')}}});assert.equal(await r.text(),'synthetic-static');assert.equal(assets,1)});
