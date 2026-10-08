import {describe,expect,it} from "vitest";
import {PostgresPersistence,type SqlClient} from "../src/persistence/postgres-persistence.js";
import {createBrainHttpServer} from "../src/runtime/http-server.js";

function client():SqlClient{
 return {
  query:async(text)=>text.startsWith("SELECT count")?{rows:[{count:1}]}:text.startsWith("SELECT * FROM memories")?{rows:[{
    id:"m1",project_id:"p1",type:"fact",content:"Remote memory",tags:JSON.stringify(["test"]),
    source:"test",confidence:0.9,importance:0.8,created_at:"2026-10-08T00:00:00Z",superseded_by:null
  }]}:{rows:[]},
  transaction:async work=>work(client())
 };
}

async function start(){
 const app=createBrainHttpServer({apiKey:"secret",persistence:new PostgresPersistence(client()),port:0});
 await app.listen();
 const address=app.server.address();
 if(!address||typeof address==="string")throw new Error("server did not bind");
 return {app,port:address.port};
}

describe("memory-bank HTTP API",()=>{
 it("returns bounded paged memories from the remote bank",async()=>{
  const {app,port}=await start();
  try{
   const response=await fetch("http://127.0.0.1:"+port+"/api/memories?projectId=p1&q=remote&limit=10&offset=0",{headers:{authorization:"Bearer secret"}});
   expect(response.status).toBe(200);
   const body=await response.json() as {items:Array<{id:string}>;total:number;limit:number};
   expect(body.items[0]?.id).toBe("m1");
   expect(body.total).toBe(1);
   expect(body.limit).toBe(10);
  }finally{await new Promise<void>(resolve=>app.server.close(()=>resolve()))}
 });
});
