import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let projects=[];
try{projects=(await readdir(join(root,'sites'),{withFileTypes:true})).filter(x=>x.isDirectory()).map(x=>join(root,'sites',x.name));}catch{projects=[root]}
if(process.argv[2])projects=projects.filter(p=>p.endsWith(process.argv[2]));assert(projects.length>0);
let count=0;
for(const project of projects){
 const c=JSON.parse(await readFile(join(project,'wrangler.jsonc'),'utf8'));
 assert(c.account_id==='c8e0e96360a788843e78c1de5a1cc73b'&&c.name.startsWith('dbe-'));assert(c.preview_urls===false);assert(!c.triggers&&!c.r2_buckets&&!c.d1_databases&&!c.kv_namespaces);
 if(c.routes){const original=JSON.parse(await readFile(join(project,'original-manifest.json'),'utf8'));let host=original.custom_domain;if(!host){const deployment=JSON.parse(await readFile(join(project,'deployment.json'),'utf8'));assert(deployment.worker===c.name&&deployment.hostname.endsWith('.dbe.digital'));host=deployment.hostname;}assert(host&&c.routes.length===1);assert(c.routes[0].pattern===host+(c.routes[0].custom_domain?'':'/*')&&c.routes[0].zone_id==='23a356e3aec655269479b763b2382c4c');}
 const publicDir=resolve(project,c.assets.directory);assert(publicDir.startsWith(project));
 async function scan(dir){for(const x of await readdir(dir,{withFileTypes:true})){assert(!/^\.env|^credentials|^credenciais|^node_modules|^\.git/i.test(x.name));const p=join(dir,x.name);if(x.isDirectory())await scan(p);else{const info=await stat(p);assert(info.size<=25*1024*1024,`Asset too large: ${x.name}`);if(/\.(html|js|mjs|css|json)$/.test(x.name)){const s=await readFile(p,'utf8');assert(!/(?:github_pat_[A-Za-z0-9_]{30,}|ghp_[A-Za-z0-9]{30,}|nfp_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(s),'Secret pattern detected');}count++;}}}
 await scan(publicDir);await stat(join(publicDir,'index.html'));
}
console.log(JSON.stringify({checks:'passed',projects:projects.length,files:count}));
