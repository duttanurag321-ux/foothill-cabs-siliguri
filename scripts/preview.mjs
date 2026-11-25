import http from 'node:http';
import worker from '../dist/server/index.js';
import {localDb} from './local-db.mjs';
const env={DB:localDb(),OWNER_PASSWORD:process.env.OWNER_PASSWORD};
http.createServer(async(req,res)=>{
 try{
 const headers=new Headers(Object.entries(req.headers).filter(([k])=>!k.startsWith('oai-')));
 const chunks=[];for await(const chunk of req)chunks.push(chunk);
 const origin='http://'+req.headers.host;
 const response=await worker.fetch(new Request(new URL(req.url,origin),{headers,method:req.method,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)}),env);
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end();}
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
