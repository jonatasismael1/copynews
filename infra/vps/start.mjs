import{readFile}from'node:fs/promises';
const env=JSON.parse(await readFile('/run/secrets/copynews-env','utf8'));
for(const[k,v]of Object.entries(env)){if(!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string')throw Error('configuration_invalid');process.env[k]=v}
const{createServer}=await import('./server.mjs');const server=createServer();server.listen(8080,'0.0.0.0');
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),35000).unref()});
