import {describe,expect,it} from "vitest";
import {AIBrain} from "../src/brain.js";
import type {AgentDefinition,Permission,ToolDefinition,Task} from "../src/domain/types.js";

const allPermissions:Permission[]=["read","write","execute","deploy-staging","deploy-production","financial","legal","destructive","security-policy"];
const requiredAuthority:Record<Permission,number>={read:0,write:1,execute:1,"deploy-staging":4,"deploy-production":5,financial:6,legal:6,destructive:6,"security-policy":6};
const agent=(authority:0|1|2|3|4|5|6,permissions:Permission[]):AgentDefinition=>({id:"sec",name:"security-test",description:"",capabilities:["goal"],permissions,authority,canHandle:t=>t.type==="goal",execute:async()=>({status:"completed",summary:"secure-test"})});
const setup=(authority:0|1|2|3|4|5|6=1,permissions:Permission[]=["read","write","execute"])=>{const b=new AIBrain();const p=b.createProject("security");b.registerAgent(agent(authority,permissions));return{b,p}};
const task=(p:string,permissions:Permission[]=["read"],risk:Task["risk"]="low"):Task=>({id:"t",projectId:p,title:"t",description:"t",type:"goal",status:"queued",dependencies:[],risk,permissions,acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});

describe("100 adversarial security cases",()=>{
  const matrix: Array<[Permission,0|1|2|3|4|5|6]> = allPermissions.flatMap(p=>([0,1,2,3,4,5,6] as const).map(a=>[p,a]));
  matrix.forEach(([permission,authority],i)=>{
    it(`security-${String(i+1).padStart(3,"0")}: permission authority boundary ${permission}/L${authority}`,async()=>{
      const {b,p}=setup(authority,[permission]);
      const result=await b.request({projectId:p.id,goal:"boundary",permissions:[permission]});
      expect(result.status).toBe(authority>=requiredAuthority[permission]?"completed":"blocked");
    });
  });

  it("security-071: agent cannot inherit permissions from task request",async()=>{
    const {b,p}=setup(6,["read"]);expect((await b.request({projectId:p.id,goal:"write",permissions:["write"]})).status).toBe("blocked");
  });
  it("security-072: agent cannot inherit execute from task request",async()=>{
    const {b,p}=setup(6,["read"]);expect((await b.request({projectId:p.id,goal:"execute",permissions:["execute"]})).status).toBe("blocked");
  });
  it("security-073: tool requires agent permission",async()=>{
    const {b,p}=setup(6,["read"]);const tool:ToolDefinition={name:"write",description:"",risk:"low",requiredPermissions:["write"],execute:async()=>42};b.tools.register(tool);
    expect(b.tools.allowedFor(task(p.id,["write"]),agent(6,["read"]))).not.toContain("write");
  });
  it("security-074: tool requires task permission",async()=>{
    const {b,p}=setup(6,["write"]);b.tools.register({name:"write",description:"",risk:"low",requiredPermissions:["write"],execute:async()=>42});
    expect(b.tools.allowedFor(task(p.id,["read"]),agent(6,["write"]))).not.toContain("write");
  });
  it("security-075: direct tool execution cannot forge permissions",async()=>{
    const {b,p}=setup(6,["read"]);b.tools.register({name:"write",description:"",risk:"low",requiredPermissions:["write"],execute:async()=>42});
    await expect(b.tools.execute({taskId:"t",agentId:"sec",toolName:"write",permissions:["write"],taskPermissions:["write"],risk:"low",input:{}},agent(6,["read"]))).rejects.toThrow();
  });
  it("security-076: critical task requires approval",async()=>{
    const {b,p}=setup(6,["read","write","execute"]);expect((await b.request({projectId:p.id,goal:"critical",risk:"critical"})).status).toBe("blocked");expect(b.store.approvals.size).toBe(1);
  });
  it("security-077: approval cannot cross tasks",async()=>{
    const {b,p}=setup(6,["read","write","execute"]);await b.request({projectId:p.id,goal:"a",risk:"critical"});await b.request({projectId:p.id,goal:"b",risk:"critical"});
    const [a]=[...b.store.approvals.values()],[t]=[...b.store.tasks.values()].slice(1);expect((await b.resumeApproved(t.id,a.id)).status).toBe("blocked");
  });
  it("security-078: approval cannot survive risk escalation",async()=>{
    const {b,p}=setup(6,["read","write","execute"]);await b.request({projectId:p.id,goal:"x",risk:"critical"});const t=[...b.store.tasks.values()][0]!,a=[...b.store.approvals.values()][0]!;b.approvals.decide(a.id,"approved","owner");t.risk="high";expect((await b.resumeApproved(t.id,a.id)).status).toBe("blocked");
  });
  it("security-079: rejected approval cannot execute",async()=>{
    const {b,p}=setup(6,["read","write","execute"]);await b.request({projectId:p.id,goal:"x",risk:"critical"});const t=[...b.store.tasks.values()][0]!,a=[...b.store.approvals.values()][0]!;b.approvals.decide(a.id,"rejected","owner");expect((await b.resumeApproved(t.id,a.id)).status).toBe("blocked");
  });
  it("security-080: kill switch blocks task",async()=>{
    const {b,p}=setup(6);b.stopAll();expect((await b.request({projectId:p.id,goal:"x"})).status).toBe("blocked");
  });
  it("security-081: kill switch blocks tool",async()=>{
    const {b,p}=setup(1,["read"]);b.tools.register({name:"read",description:"",risk:"low",requiredPermissions:["read"],execute:async()=>1});b.stopAll();
    await expect(b.tools.execute({taskId:"t",agentId:"sec",toolName:"read",permissions:[],taskPermissions:["read"],risk:"low",input:{}},agent(1,["read"]))).rejects.toThrow();
  });
  it("security-082: duplicate tools rejected",()=>{const {b}=setup();const t:ToolDefinition={name:"x",description:"",risk:"low",requiredPermissions:["read"],execute:async()=>1};b.tools.register(t);expect(()=>b.tools.register(t)).toThrow()});
  it("security-083: duplicate agents rejected",()=>{const {b}=setup();expect(()=>b.registerAgent(agent(1,["read"]))).toThrow()});
  it("security-084: dependency failure blocks readiness",()=>{const {b,p}=setup();const a=b.plan(p.id,[{key:"a",title:"a",description:""},{key:"b",title:"b",description:"",dependsOn:["a"]}]);a[0]!.status="failed";expect(b.taskGraph.ready(p.id)).toHaveLength(0)});
  it("security-085: dependency cancellation blocks readiness",()=>{const {b,p}=setup();const a=b.plan(p.id,[{key:"a",title:"a",description:""},{key:"b",title:"b",description:"",dependsOn:["a"]}]);a[0]!.status="cancelled";expect(b.taskGraph.ready(p.id)).toHaveLength(0)});
  it("security-086: cycles rejected",()=>{const {b,p}=setup();expect(()=>b.plan(p.id,[{key:"a",title:"a",description:"",dependsOn:["a"]}])).toThrow()});
  it("security-087: missing dependencies rejected",()=>{const {b,p}=setup();expect(()=>b.plan(p.id,[{key:"a",title:"a",description:"",dependsOn:["missing"]}])).toThrow()});
  it("security-088: cross-project memory isolation",()=>{const {b,p}=setup();const q=b.createProject("other");b.remember({projectId:q.id,type:"fact",content:"secret",tags:["secret"],source:"test",confidence:1,importance:10});expect(b.memory.retrieve(p.id,"secret")).toHaveLength(0)});
  it("security-089: global memory is explicitly shareable",()=>{const {b,p}=setup();b.remember({type:"fact",content:"global",tags:["global"],source:"test",confidence:1,importance:1});expect(b.memory.retrieve(p.id,"global")).toHaveLength(1)});
  it("security-090: superseded memory is not returned",()=>{const {b,p}=setup();const m=b.remember({projectId:p.id,type:"fact",content:"old",tags:["x"],source:"test",confidence:1,importance:1});b.supersedeMemory(m.id,{projectId:p.id,type:"fact",content:"new",tags:["x"],source:"test",confidence:1,importance:1});expect(b.memory.retrieve(p.id,"x").map(x=>x.content)).toEqual(["new"])});
  it("security-091: graph strips event payload",()=>{const {b,p}=setup();b.store.events.push({id:"e",type:"x",timestamp:"t",projectId:p.id,actor:"x",data:{secret:"LEAK",memoryId:"missing"}});expect(JSON.stringify(b.visualGraph())).not.toContain("LEAK")});
  it("security-092: graph namespaces node IDs",()=>{const {b,p}=setup();b.store.tasks.set("same",{...task(p.id),id:"same"});b.store.events.push({id:"same",type:"x",timestamp:"t",projectId:p.id,actor:"x",data:{}});const ids=b.visualGraph().nodes.map(n=>n.id);expect(new Set(ids).size).toBe(ids.length);expect(ids).toContain("task:same");expect(ids).toContain("event:same")});
  it("security-093: graph does not expose task output",()=>{const {b,p}=setup();const t=task(p.id);t.output={secret:"LEAK"};b.store.tasks.set(t.id,t);expect(JSON.stringify(b.visualGraph())).not.toContain("LEAK")});
  it("security-094: graph does not mutate store",()=>{const {b,p}=setup();b.store.tasks.set("t",task(p.id));const before=JSON.stringify([...b.store.tasks.values()]);b.visualGraph();expect(JSON.stringify([...b.store.tasks.values()])).toBe(before)});
  it("security-095: invalid permission string blocked",async()=>{const {b,p}=setup(6,["read"]);expect((await b.request({projectId:p.id,goal:"x",permissions:["not-a-permission" as Permission]})).status).toBe("blocked")});
  it("security-096: unknown task blocked",async()=>{const {b}=setup();expect((await b.orchestrator.runTask("missing")).status).toBe("blocked")});
  it("security-097: unknown approval blocked",async()=>{const {b}=setup();expect((await b.resumeApproved("missing","missing")).status).toBe("blocked")});
  it("security-098: attempt budget enforced",async()=>{const {b,p}=setup();const t=b.plan(p.id,[{key:"x",title:"x",description:""}])[0]!;t.budget={maxAttempts:0};expect((await b.orchestrator.runTask(t.id)).status).toBe("blocked")});
  it("security-099: worker claim is exclusive in one store",async()=>{const {b,p}=setup();const t=b.plan(p.id,[{key:"x",title:"x",description:""}])[0]!;const a=b.store.claimReadyTasks(p.id,"w1",10000,1),c=b.store.claimReadyTasks(p.id,"w2",10000,1);expect(a).toHaveLength(1);expect(c).toHaveLength(0);expect(t.lease?.workerId).toBe("w1")});
  it("security-101: tools cannot run on completed tasks",async()=>{const {b,p}=setup(6,["read"]);const t=task(p.id,["read"]);t.status="completed";b.store.tasks.set(t.id,t);b.tools.register({name:"read",description:"",risk:"low",requiredPermissions:["read"],execute:async()=>1});await expect(b.tools.execute({taskId:t.id,agentId:"sec",toolName:"read",permissions:[],taskPermissions:["read"],risk:"low",input:{}},agent(6,["read"]))).rejects.toThrow("running task")});
  it("security-102: oversized tool input is rejected",async()=>{const {b,p}=setup(6,["read"]);const t=task(p.id,["read"]);t.status="running";t.assignedAgent="sec";b.store.tasks.set(t.id,t);b.tools.register({name:"read",description:"",risk:"low",requiredPermissions:["read"],execute:async()=>1});await expect(b.tools.execute({taskId:t.id,agentId:"sec",toolName:"read",permissions:[],taskPermissions:["read"],risk:"low",input:"x".repeat(100_001)},agent(6,["read"]))).rejects.toThrow("too large")});
  it("security-103: expired claim can be reclaimed",()=>{const {b,p}=setup();const t=b.plan(p.id,[{key:"x",title:"x",description:""}])[0]!;t.lease={workerId:"dead",expiresAt:Date.now()-1};const a=b.store.claimReadyTasks(p.id,"w2",10000,1);expect(a).toHaveLength(1);expect(t.lease?.workerId).toBe("w2")});
});
