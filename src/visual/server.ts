import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {randomBytes} from "node:crypto";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {AIBrain} from "../brain.js";
import {brainGraphResponse} from "./brain-api.js";
const root=dirname(fileURLToPath(import.meta.url));
const htmlPath=join(root,"../../web/brain-map.html");
export function createBrainVisualServer(brain:AIBrain){
 return createServer(async(req:IncomingMessage,res:ServerResponse)=>{
  try{
   const path=new URL(req.url??"/","http://127.0.0.1").pathname;
   if(req.method!=="GET"){res.writeHead(405,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","allow":"GET"});res.end(JSON.stringify({error:"method not allowed"}));return}
   if(path==="/api/brain/graph"){const out=brainGraphResponse(brain);res.writeHead(out.status,out.headers);res.end(out.body);return}
   if(path==="/"||path==="/brain-map.html"){
    const body=await readFile(htmlPath,"utf8");
    const nonce=randomBytes(16).toString("base64");
    const html=body.replace("<script>","<script nonce=\""+nonce+"\">");
    res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'; object-src 'none';"});
    res.end(html);return;
   }
   res.writeHead(404,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify({error:"not found"}));
  }catch{res.writeHead(500,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify({error:"internal server error"}))}
 });
}
export function startBrainVisualServer(brain:AIBrain,port=Number(process.env.PORT||8787)){if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid PORT");const server=createBrainVisualServer(brain);server.listen(port,"127.0.0.1",()=>console.log("AIB Brain visual server listening on http://127.0.0.1:"+port));return server}
if(process.argv[1]===fileURLToPath(import.meta.url))startBrainVisualServer(new AIBrain());
