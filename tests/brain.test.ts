import {describe,it,expect} from "vitest";
import {AIBrain} from "../src/brain.js";
import type {AgentDefinition,ModelProvider} from "../src/domain/types.js";
import {ModelBackedAgent} from "../src/agents/model-backed-agent.js";

function agent(authority=1):AgentDefinition{
  return{id:"developer",name:"Developer",description:"test",capabilities:["code"],permissions:["read","write","execute"],authority,canHandle:t=>t.type==="goal",async execute(){return{status:"completed",summary:"ok",output:{ok:true}}}};
}

describe("AI Brain foundation",()=>{
  it("runs permitted work",async()=>{
    const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());
    const r=await b.request({projectId:p.id,goal:"do work",permissions:["write"]});
    expect(r.status).toBe("completed");expect(b.store.events.map(e=>e.type)).toContain("task.completed");
  });
  it("blocks insufficient authority",async()=>{
    const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());
    const r=await b.request({projectId:p.id,goal:"deploy",risk:"high",permissions:["deploy-staging"]});
    expect(r.status).toBe("blocked");
  });
  it("kill switch blocks execution",async()=>{
    const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent());b.stopAll();
    const r=await b.request({projectId:p.id,goal:"do work"});expect(r.status).toBe("blocked");
  });
});

it("creates and resumes an approved gated task",async()=>{
  const b=new AIBrain();const p=b.createProject("test");b.registerAgent(agent(6));
  const blocked=await b.request({projectId:p.id,goal:"gated operation",risk:"critical"});
  expect(blocked.status).toBe("blocked");
  const approval=[...b.store.approvals.values()][0];const task=[...b.store.tasks.values()][0];
  if(!approval||!task)throw new Error("approval/task missing");
  b.approvals.decide(approval.id,"approved","owner");
  const resumed=await b.resumeApproved(task.id,approval.id);
  expect(resumed.status).toBe("completed");
});

it("supersedes memory",()=>{
  const b=new AIBrain();const p=b.createProject("test");
  const old=b.remember({projectId:p.id,type:"rule",content:"old rule",tags:["rule"],source:"test",confidence:1,importance:5});
  b.supersedeMemory(old.id,{projectId:p.id,type:"rule",content:"new rule",tags:["rule"],source:"test",confidence:1,importance:5});
  const memories=b.memory.retrieve(p.id,"rule");
  expect(memories).toHaveLength(1);expect(memories[0]?.content).toBe("new rule");
});

it("enforces the task permission envelope on tools",async()=>{
  const b=new AIBrain();const p=b.createProject("tools");
  let seen:string[]=[];
  b.tools.register({name:"safe",description:"safe",risk:"low",requiredPermissions:["read"],async execute(){return"ok"}});
  b.tools.register({name:"write-tool",description:"write",risk:"medium",requiredPermissions:["write"],async execute(){return"changed"}});
  const a:AgentDefinition={...agent(),id:"tool-agent",permissions:["read","write"],async execute(ctx){
    seen=ctx.allowedTools;
    const value=await ctx.toolRuntime?.execute("safe",{});
    let blocked=false;
    try{await ctx.toolRuntime?.execute("write-tool",{});}catch{blocked=true;}
    expect(blocked).toBe(true);
    return{status:"completed",summary:"ok",output:value};
  }};
  b.registerAgent(a);
  const r=await b.request({projectId:p.id,goal:"use tools",risk:"medium",permissions:["read"]});
  expect(r.status).toBe("completed");
  expect(seen).toContain("safe");expect(seen).not.toContain("write-tool");
});

it("builds dependency graphs and runs ready tasks in order",async()=>{
  const b=new AIBrain();const p=b.createProject("plan");const executed:string[]=[];
  const a:AgentDefinition={...agent(),id:"planner-agent",canHandle:t=>t.type==="planned"||t.type==="goal",async execute(ctx){executed.push(ctx.task.title);return{status:"completed",summary:"ok"}}};
  b.registerAgent(a);
  const tasks=b.plan(p.id,[{key:"one",title:"one",description:"first"},{key:"two",title:"two",description:"second",dependsOn:["one"]}]);
  expect(tasks[1]?.dependencies).toEqual([tasks[0]?.id]);
  await b.runReady(p.id);expect(executed).toEqual(["one"]);
  await b.runReady(p.id);expect(executed).toEqual(["one","two"]);
});

it("drains independent tasks through the bounded scheduler",async()=>{
  const b=new AIBrain();const p=b.createProject("scheduler");const executed:string[]=[];
  const a:AgentDefinition={...agent(),id:"scheduler-agent",canHandle:t=>t.type==="planned",async execute(ctx){
    await new Promise(r=>setTimeout(r,5));executed.push(ctx.task.title);return{status:"completed",summary:"ok"};
  }};
  b.registerAgent(a);
  b.plan(p.id,[{key:"a",title:"a",description:"a"},{key:"b",title:"b",description:"b"},{key:"c",title:"c",description:"c",dependsOn:["a"]}]);
  const results=await b.scheduler.drain(p.id,10);
  expect(results.filter(r=>r.status==="completed")).toHaveLength(3);
  expect(executed).toEqual(["a","b","c"]);
});

it("runs a model-backed agent through the provider router",async()=>{
  const b=new AIBrain();const p=b.createProject("model");
  const provider:ModelProvider={id:"fake",models:()=>["test-model"],async complete(){return{provider:"fake",model:"test-model",text:"model result"}}};
  b.registerModelProvider(provider);
  b.registerAgent(new ModelBackedAgent({
    id:"model-agent",name:"Model Agent",description:"test model agent",capabilities:["general"],
    permissions:["read"],authority:0,providerId:"fake",model:"test-model",systemPrompt:"You are a test agent.",router:b.models
  }));
  const r=await b.request({projectId:p.id,goal:"answer the task",acceptanceCriteria:["model result"]});
  expect(r.status).toBe("completed");expect(r.summary).toContain("model result");
});

it("registers the standard specialist team",()=>{
  const b=new AIBrain();
  const provider:ModelProvider={id:"fake",models:()=>["test-model"],async complete(){return{provider:"fake",model:"test-model",text:"ok"}}};
  b.registerModelProvider(provider);
  const agents=b.registerStandardAgents("fake","test-model");
  expect(agents).toHaveLength(8);
  expect(b.agents.get("security")?.authority).toBe(3);
  expect(b.agents.get("researcher")?.permissions).toEqual(["read"]);
});


it("persists the Brain state through the SQL adapter",async()=>{
  const b=new AIBrain();const p=b.createProject("durable");
  b.remember({projectId:p.id,type:"fact",content:"durable fact",tags:["durable"],source:"test",confidence:1,importance:1});
  const queries:string[]=[];
  const client:any={
    async query(text:string){queries.push(text);return{rows:[]};},
    async transaction(work:(tx:any)=>Promise<unknown>){return work(this);}
  };
  const {PostgresPersistence}=await import("../src/persistence/postgres-persistence.js");
  const persisted=await b.persist(new PostgresPersistence(client));
  expect(persisted.projects).toBe(1);
  expect(persisted.memories).toBe(1);
  expect(queries.some(q=>q.startsWith("INSERT INTO projects"))).toBe(true);
  expect(queries.some(q=>q.startsWith("INSERT INTO memories"))).toBe(true);
});


it("runs queued work through the Brain worker",async()=>{
  const b=new AIBrain();const p=b.createProject("worker");const executed:string[]=[];
  b.registerAgent({...agent(),id:"worker-agent",canHandle:t=>t.type==="planned",async execute(ctx){
    executed.push(ctx.task.title);return{status:"completed",summary:"ok"};
  }});
  b.plan(p.id,[{key:"one",title:"one",description:"one"},{key:"two",title:"two",description:"two",dependsOn:["one"]}]);
  const results=await b.worker.runUntilIdle(p.id);
  expect(executed).toEqual(["one","two"]);
  expect(results.length).toBeGreaterThan(0);
  expect(b.store.projectTasks(p.id).every(t=>t.status==="completed")).toBe(true);
});

it("recovers an expired worker lease",async()=>{
  const b=new AIBrain();const p=b.createProject("recovery");b.registerAgent({...agent(),id:"recovery-agent",canHandle:t=>t.type==="planned"});
  const task= b.plan(p.id,[{key:"one",title:"one",description:"one"}])[0];
  if(!task)throw new Error("task missing");
  task.status="running";task.updatedAt=new Date().toISOString();
  const worker=(b.worker as any);
  worker.claimed.set(task.id,Date.now()-1);
  const tick=await b.worker.tick(p.id);
  expect(tick.recovered).toBe(1);
  expect(task.status).toBe("completed");
  expect(b.store.events.map(e=>e.type)).toContain("worker.task.recovered");
});

it("uses durable lease SQL without trusting malformed task output",async()=>{
  const {PostgresPersistence}=await import("../src/persistence/postgres-persistence.js");
  const calls:{sql:string;values:readonly unknown[]|undefined}[]=[];
  const client:any={
    async query(text:string,values?:readonly unknown[]){calls.push({sql:text,values});return{rows:text.startsWith("WITH expired")||text.startsWith("UPDATE tasks SET lease_until")||text.startsWith("UPDATE tasks")?[{id:"task-1"}]:[]};},
    async transaction(work:(tx:any)=>Promise<unknown>){return work(this);}
  };
  const persistence=new PostgresPersistence(client);
  await expect(persistence.claimReadyTaskIds("project","worker",1000,2)).resolves.toEqual(["task-1"]);
  await persistence.heartbeatTaskLease("task-1","worker",1000);
  await persistence.saveTaskLease({
    id:"task-1",projectId:"project",title:"task",description:"task",type:"planned",status:"completed",
    dependencies:[],risk:"low",permissions:[],acceptanceCriteria:[],attempts:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  } as any,"worker");
  expect(calls.some(x=>x.sql.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
  expect(calls.some(x=>x.sql.startsWith("UPDATE tasks SET lease_until"))).toBe(true);
  const release=calls.find(x=>x.sql.startsWith("UPDATE tasks"));
  expect(release?.values?.[4]).toBeNull();
});


it("rejects malformed model provider responses",async()=>{
  const b=new AIBrain();
  b.registerModelProvider({id:"bad",models:()=>["m"],async complete(){return{text:123 as any,provider:"bad",model:"m"}}});
  await expect(b.completeModel({messages:[{role:"user",content:"hello"}]},"bad","m")).rejects.toThrow("invalid or oversized response");
});

it("prevents a model/tool caller from bypassing the allowed tool set",async()=>{
  const b=new AIBrain();const p=b.createProject("tool-boundary");
  b.tools.register({name:"read",description:"read",risk:"low",requiredPermissions:["read"],async execute(){return"ok"}});
  b.tools.register({name:"write",description:"write",risk:"medium",requiredPermissions:["write"],async execute(){return"changed"}});
  const a:AgentDefinition={...agent(),id:"boundary-agent",canHandle:t=>t.type==="goal",async execute(ctx){
    await expect(ctx.toolRuntime?.execute("write",{})).rejects.toThrow("not in the task's allowed tool set");
    return{status:"completed",summary:"ok"};
  }};
  b.registerAgent(a);
  const result=await b.request({projectId:p.id,goal:"boundary test",risk:"medium",permissions:["read"]});
  expect(result.status).toBe("completed");
});

