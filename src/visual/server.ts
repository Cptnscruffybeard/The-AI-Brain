import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import {AIBrain} from "../brain.js";
import {brainGraphResponse,brainSnapshotResponse} from "./brain-api.js";

const brain=new AIBrain();
const root=dirname(fileURLToPath(import.meta.url));
const htmlPath=join(root,"../../web/brain-map.html");

const server=createServer(async(req,res)=>{
  try{
    if(req.url==="/api/brain/graph"){
      const out=brainGraphResponse(brain); res.writeHead(out.status,out.headers); res.end(out.body); return;
    }
    if(req.url==="/api/brain/snapshot"){
      const out=brainSnapshotResponse(brain); res.writeHead(out.status,out.headers); res.end(out.body); return;
    }
    if(req.url==="/"||req.url==="/brain-map.html"){
      const body=await readFile(htmlPath); res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}); res.end(body); return;
    }
    res.writeHead(404,{"content-type":"application/json"}); res.end(JSON.stringify({error:"not found"}));
  }catch(error){
    res.writeHead(500,{"content-type":"application/json"}); res.end(JSON.stringify({error:"internal server error"}));
  }
});

const port=Number(process.env.PORT||8787);
server.listen(port,"127.0.0.1",()=>console.log("AIB Brain visual server listening on http://127.0.0.1:"+port));
