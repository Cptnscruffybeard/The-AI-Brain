import {describe,expect,it} from "vitest";
import {createBrainHttpServer} from "../src/runtime/http-server.js";

async function start(options:Parameters<typeof createBrainHttpServer>[0]={}) {
  const app=createBrainHttpServer({...options,apiKey:"secret",port:0});
  await app.listen();
  const address=app.server.address();
  if(!address||typeof address==="string") throw new Error("server did not bind");
  return {app,base:"http://127.0.0.1:"+address.port};
}
async function stop(app:ReturnType<typeof createBrainHttpServer>) {
  await new Promise<void>(resolve=>app.server.close(()=>resolve()));
}
const headers={authorization:"Bearer secret","content-type":"application/json"};

describe("Brain HTTP API integration",()=>{
  it("serves the console with a nonce CSP and no-store caching",async()=>{
    const {app,base}=await start();
    try{
      const response=await fetch(base+"/");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toMatch(/script-src 'nonce-[^']+'/);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.text()).toContain("Brain Console");
    }finally{await stop(app)}
  });
  it("rejects unsupported methods",async()=>{
    const {app,base}=await start();
    try{
      const response=await fetch(base+"/api/health",{method:"DELETE"});
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, POST");
    }finally{await stop(app)}
  });
  it("creates a project and exposes it through state and task APIs",async()=>{
    const {app,base}=await start();
    try{
      const created=await fetch(base+"/api/projects",{method:"POST",headers,body:JSON.stringify({name:"Integration Project",description:"test"})});
      expect(created.status).toBe(201);
      const project=await created.json() as {id:string;name:string};
      expect(project.name).toBe("Integration Project");
      const state=await fetch(base+"/api/state",{headers:{authorization:"Bearer secret"}});
      expect(state.status).toBe(200);
      const snapshot=await state.json() as {projects:Array<{id:string}>};
      expect(snapshot.projects.some(x=>x.id===project.id)).toBe(true);
      const tasks=await fetch(base+"/api/tasks?projectId="+encodeURIComponent(project.id),{headers:{authorization:"Bearer secret"}});
      expect(tasks.status).toBe(200);
      expect((await tasks.json() as {tasks:unknown[]}).tasks).toEqual([]);
    }finally{await stop(app)}
  });
  it("validates memory writes and blocks unknown projects",async()=>{
    const {app,base}=await start();
    try{
      const missing=await fetch(base+"/api/memories",{method:"POST",headers,body:JSON.stringify({projectId:"missing",content:"x"})});
      expect(missing.status).toBe(400);
    }finally{await stop(app)}
  });
  it("rejects malformed JSON and oversized fields",async()=>{
    const {app,base}=await start();
    try{
      const malformed=await fetch(base+"/api/projects",{method:"POST",headers,body:"not-json"});
      expect(malformed.status).toBe(400);
      const huge=await fetch(base+"/api/projects",{method:"POST",headers,body:JSON.stringify({name:"x".repeat(1_001)})});
      expect(huge.status).toBe(400);
    }finally{await stop(app)}
  });
  it("protects policy endpoints with execute permission",async()=>{
    const {app,base}=await start({callerPermissions:["read","write"]});
    try{
      expect((await fetch(base+"/api/policy/stop",{method:"POST",headers,body:"{}"})).status).toBe(403);
      expect((await fetch(base+"/api/policy/resume",{method:"POST",headers,body:"{}"})).status).toBe(403);
    }finally{await stop(app)}
  });
  it("requires execute permission for approval decisions",async()=>{
    const {app,base}=await start({callerPermissions:["read","write"]});
    try{
      expect((await fetch(base+"/api/approvals/decide",{method:"POST",headers,body:JSON.stringify({approvalId:"missing",decision:"approved"})})).status).toBe(403);
    }finally{await stop(app)}
  });
  it("validates chat project selection before invoking the model",async()=>{
    const {app,base}=await start();
    try{
      expect((await fetch(base+"/api/chat",{method:"POST",headers,body:JSON.stringify({projectId:"missing",message:"hello"})})).status).toBe(404);
    }finally{await stop(app)}
  });
  it("rejects malformed permission and risk requests at the HTTP boundary",async()=>{
    const {app,base}=await start();
    try{
      const project=await fetch(base+"/api/projects",{method:"POST",headers,body:JSON.stringify({name:"Boundary"})});
      const {id}=await project.json() as {id:string};
      const badRisk=await fetch(base+"/api/projects/goal",{method:"POST",headers,body:JSON.stringify({projectId:id,goal:"x",risk:"extreme",permissions:["read"]})});
      expect(badRisk.status).toBe(400);
      const badPermission=await fetch(base+"/api/projects/goal",{method:"POST",headers,body:JSON.stringify({projectId:id,goal:"x",risk:"low",permissions:["root"]})});
      expect(badPermission.status).toBe(400);
    }finally{await stop(app)}
  });
});
