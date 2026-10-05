import {describe,it,expect} from "vitest"; import {AIBrain} from "../src/brain.js"; import type {AgentDefinition} from "../src/domain/types.js";
function agent(authority=1):AgentDefinition{return{id:"developer",name:"Developer",description:"test",capabilities:["code"],permissions:["read","write","execute"],authority,canHandle:t=>t.type==="goal",async execute(){return{status:"completed",summary:"ok",output:{ok:true}}}}}
describe("AI Brain foundation",()=>{it("runs permitted work",async()=>{const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());const r=await b.request({projectId:p.id,goal:"do work",permissions:["write"]});expect(r.status).toBe("completed");expect(b.store.events.map(e=>e.type)).toContain("task.completed")});it("blocks insufficient authority",async()=>{const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());const r=await b.request({projectId:p.id,goal:"deploy",risk:"high",permissions:["deploy-staging"]});expect(r.status).toBe("blocked")});it("kill switch blocks execution",async()=>{const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());b.stopAll();const r=await b.request({projectId:p.id,goal:"do work"});expect(r.status).toBe("blocked")});});


it("creates and resumes an approved gated task",async()=>{
  const b=new AIBrain(); const p=b.createProject("test"); b.registerAgent(agent(6));
  const blocked=await b.request({projectId:p.id,goal:"gated operation",risk:"critical"});
  expect(blocked.status).toBe("blocked");
  const approval=[...b.store.approvals.values()][0];
  const task=[...b.store.tasks.values()][0];
  if(!approval||!task) throw new Error("approval/task missing");
  b.approvals.decide(approval.id,"approved","owner");
  const resumed=await b.resumeApproved(task.id,approval.id);
  expect(resumed.status).toBe("completed");
});

it("supersedes memory",()=>{
  const b=new AIBrain(); const p=b.createProject("test");
  const old=b.remember({projectId:p.id,type:"rule",content:"old rule",tags:["rule"],source:"test",confidence:1,importance:5});
  b.supersedeMemory(old.id,{projectId:p.id,type:"rule",content:"new rule",tags:["rule"],source:"test",confidence:1,importance:5});
  const memories=b.memory.retrieve(p.id,"rule");
  expect(memories).toHaveLength(1);
  expect(memories[0]?.content).toBe("new rule");
});

it("gives agents only policy-approved tools",async()=>{
  const b=new AIBrain(); const p=b.createProject("tools");
  let seen:string[]=[];
  b.tools.register({name:"safe",description:"safe",risk:"low",requiredPermissions:["read"],async execute(){return "ok"}});
  b.tools.register({name:"write-tool",description:"write",risk:"medium",requiredPermissions:["write"],async execute(){return "changed"}});
  const a:AgentDefinition={...agent(),id:"tool-agent",permissions:["read"],async execute(ctx){seen=ctx.allowedTools; expect(ctx.toolRuntime).toBeDefined(); const value=await ctx.toolRuntime?.execute("safe",{}); return{status:"completed",summary:"ok",output:value}}};
  b.registerAgent(a);
  const r=await b.request({projectId:p.id,goal:"use tools",risk:"medium",permissions:["read"]});
  expect(r.status).toBe("completed");
  expect(seen).toContain("safe");
  expect(seen).not.toContain("write-tool");
});

it("builds dependency graphs and runs ready tasks in order",async()=>{
  const b=new AIBrain(); const p=b.createProject("plan");
  const executed:string[]=[];
  const a:AgentDefinition={...agent(),id:"planner-agent",canHandle:t=>t.type==="planned"||t.type==="goal",async execute(ctx){executed.push(ctx.task.title);return{status:"completed",summary:"ok"}}};
  b.registerAgent(a);
  const tasks=b.plan(p.id,[
    {key:"one",title:"one",description:"first"},
    {key:"two",title:"two",description:"second",dependsOn:["one"]}
  ]);
  expect(tasks[1]?.dependencies).toEqual([tasks[0]?.id]);
  await b.runReady(p.id);
  expect(executed).toEqual(["one"]);
  await b.runReady(p.id);
  expect(executed).toEqual(["one","two"]);
});
