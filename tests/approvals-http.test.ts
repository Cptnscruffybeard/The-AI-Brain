import {describe,expect,it} from "vitest";
import {createBrainHttpServer} from "../src/runtime/http-server.js";
import {AIBrain} from "../src/brain.js";
import type {AgentDefinition} from "../src/domain/types.js";

async function start(brain:AIBrain){
  const app=createBrainHttpServer({brain,apiKey:"secret",callerPermissions:["read","write","execute"],port:0});
  await app.listen();
  const address=app.server.address();
  if(!address||typeof address==="string")throw new Error("server did not bind");
  return {app,port:address.port};
}
async function stop(app:ReturnType<typeof createBrainHttpServer>){await new Promise<void>(resolve=>app.server.close(()=>resolve()))}

describe("approval HTTP endpoints",()=>{
  it("lists pending approvals and decides them",async()=>{
    const brain=new AIBrain();
    const agent:AgentDefinition={
      id:"ops",name:"ops",description:"",capabilities:["goal"],permissions:["read","write","execute"],authority:3,
      canHandle:()=>true,execute:async()=>({status:"completed",summary:"approved work done"})
    };
    brain.registerAgent(agent);
    const project=brain.createProject("approvals");
    const blocked=await brain.request({projectId:project.id,goal:"critical path",risk:"critical",permissions:["read"]});
    expect(blocked.status).toBe("blocked");
    const approval=[...brain.store.approvals.values()][0]!;

    const {app,port}=await start(brain);
    try{
      const listed=await fetch("http://127.0.0.1:"+port+"/api/approvals?status=pending",{headers:{authorization:"Bearer secret"}});
      expect(listed.status).toBe(200);
      const body=await listed.json() as {approvals:Array<{id:string}>};
      expect(body.approvals.map(a=>a.id)).toContain(approval.id);

      const decided=await fetch("http://127.0.0.1:"+port+"/api/approvals/decide",{
        method:"POST",
        headers:{authorization:"Bearer secret","content-type":"application/json"},
        body:JSON.stringify({approvalId:approval.id,decision:"approved",decidedBy:"tester"})
      });
      expect(decided.status).toBe(200);
      const decision=await decided.json() as {approval:{status:string};result:{status:string;summary:string}};
      expect(decision.approval.status).toBe("approved");
      expect(decision.result.status).toBe("completed");
      expect(decision.result.summary).toContain("approved work done");
    }finally{await stop(app)}
  });
});
