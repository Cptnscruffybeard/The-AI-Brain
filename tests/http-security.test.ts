import {describe,expect,it} from "vitest";
import {createBrainHttpServer} from "../src/runtime/http-server.js";

async function start(options:Parameters<typeof createBrainHttpServer>[0]){
 const app=createBrainHttpServer({...options,port:0});
 await app.listen();
 const address=app.server.address();
 if(!address||typeof address==="string")throw new Error("server did not bind");
 return {app,port:address.port};
}
async function stop(app:ReturnType<typeof createBrainHttpServer>){await new Promise<void>(resolve=>app.server.close(()=>resolve()))}

describe("HTTP control-plane security",()=>{
 it("requires authentication when a control-plane key is configured",async()=>{
  const {app,port}=await start({apiKey:"secret"});
  try{
   expect((await fetch("http://127.0.0.1:"+port+"/api/health")).status).toBe(401);
   expect((await fetch("http://127.0.0.1:"+port+"/api/health",{headers:{authorization:"Bearer secret"}})).status).toBe(200);
  }finally{await stop(app)}
 });
 it("rejects a non-loopback server without an API key",()=>{expect(()=>createBrainHttpServer({host:"0.0.0.0"})).toThrow("BRAIN_API_KEY")});
 it("does not allow callers to exceed their permission ceiling",async()=>{
  const {app,port}=await start({apiKey:"secret",callerPermissions:["read","write"]});
  try{
   const project=await fetch("http://127.0.0.1:"+port+"/api/projects",{method:"POST",headers:{authorization:"Bearer secret","content-type":"application/json"},body:JSON.stringify({name:"test"})});
   expect(project.status).toBe(201);
   const body=await project.json() as {id:string};
   const goal=await fetch("http://127.0.0.1:"+port+"/api/projects/goal",{method:"POST",headers:{authorization:"Bearer secret","content-type":"application/json"},body:JSON.stringify({projectId:body.id,goal:"escalate",permissions:["deploy-production"],risk:"high"})});
   expect(goal.status).toBe(403);
  }finally{await stop(app)}
 });
 it("enforces a caller risk ceiling",async()=>{
  const {app,port}=await start({apiKey:"secret",callerPermissions:["read","write"],callerRiskCeiling:"medium"});
  try{
   const project=await fetch("http://127.0.0.1:"+port+"/api/projects",{method:"POST",headers:{authorization:"Bearer secret","content-type":"application/json"},body:JSON.stringify({name:"test"})});
   const body=await project.json() as {id:string};
   const goal=await fetch("http://127.0.0.1:"+port+"/api/projects/goal",{method:"POST",headers:{authorization:"Bearer secret","content-type":"application/json"},body:JSON.stringify({projectId:body.id,goal:"high",permissions:["read"],risk:"high"})});
   expect(goal.status).toBe(403);
  }finally{await stop(app)}
 });
 it("enforces a separate drain rate limit",async()=>{
  const {app,port}=await start({apiKey:"secret",callerPermissions:["execute"],rateLimit:100,drainRateLimit:1});
  try{
   const p=app.brain.createProject("test");
   const headers={authorization:"Bearer secret","content-type":"application/json"};
   expect((await fetch("http://127.0.0.1:"+port+"/api/worker/drain",{method:"POST",headers,body:JSON.stringify({projectId:p.id})})).status).not.toBe(429);
   expect((await fetch("http://127.0.0.1:"+port+"/api/worker/drain",{method:"POST",headers,body:JSON.stringify({projectId:p.id})})).status).toBe(429);
  }finally{await stop(app)}
 });
});
