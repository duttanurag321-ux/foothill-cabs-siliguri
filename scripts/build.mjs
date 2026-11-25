import {readdir,readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript; charset=utf-8',json:'application/json',svg:'image/svg+xml',webp:'image/webp',jpg:'image/jpeg',png:'image/png',woff2:'font/woff2'};
const assets={};
async function collect(dir) {
  for (const file of await readdir(dir,{withFileTypes:true})) {
    const name=path.join(dir,file.name);
    if(file.isDirectory()){await collect(name);continue;}
    const key='/'+path.relative('public',name).split(path.sep).join('/');
    assets[key]=[types[file.name.split('.').pop()]||'application/octet-stream',(await readFile(name)).toString('base64')];
  }
}
await collect('public');
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
const seed=JSON.parse(await readFile('public/routes.json','utf8'));
const code=await readFile('worker/index.js','utf8');
await writeFile('dist/server/index.js','const assets='+JSON.stringify(assets)+';\nconst seed='+JSON.stringify(seed)+';\n'+code);
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
