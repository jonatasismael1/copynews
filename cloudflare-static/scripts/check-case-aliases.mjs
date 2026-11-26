import{readFile,readdir}from'node:fs/promises';import{resolve,join,posix}from'node:path';import{fileURLToPath}from'node:url';import assert from'node:assert/strict';
const root=fileURLToPath(new URL('../public/',import.meta.url)),files=new Map();
async function collect(dir){for(const x of await readdir(dir,{withFileTypes:true})){const path=join(dir,x.name);if(x.isDirectory())await collect(path);else{const relative=path.slice(root.length).replaceAll('\\','/');files.set(relative.toLowerCase(),relative)}}}await collect(root);
const redirects=new Map((await readFile(join(root,'_redirects'),'utf8')).trim().split(/\r?\n/).map(line=>line.split(/\s+/)).map(([a,b])=>[a,b]));let checked=0;
for(const file of files.values()){
 if(!/\.(js|html|css|webmanifest)$/.test(file))continue;
 const text=await readFile(resolve(root,file),'utf8');
 for(const match of text.matchAll(/["'`]([^"'`\r\n]{1,300})["'`]|url\(([^)]+)\)/g)){
  const token=(match[1]||match[2]).replace(/^["'` ]+|["'` ]+$/g,'');if(/^(https?:|data:|\/\/|#)/.test(token)||token.includes('${'))continue;
  let path;try{path=decodeURIComponent(token.split(/[?#]/)[0])}catch{continue}if(!path||path.includes('\\'))continue;
  const candidates=[posix.normalize(path.startsWith('/')?path.slice(1):posix.join(posix.dirname(file),path))];if(path.startsWith('assets/'))candidates.push(path);
  for(const candidate of candidates){const actual=files.get(candidate.toLowerCase());if(actual&&actual!==candidate){assert.equal(redirects.get('/'+candidate),'/'+actual,'Missing case-sensitive module alias: '+candidate);checked++}}
 }
}
console.log(JSON.stringify({case_sensitive_references_validated:checked}));
