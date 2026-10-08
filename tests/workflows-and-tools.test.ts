import {describe,expect,it} from "vitest";
import {promises as fs} from "node:fs";
import path from "node:path";
import os from "node:os";
import {spawnSync} from "node:child_process";
import {AIBrain} from "../src/brain.js";
import {researchToBriefWorkflow} from "../src/orchestration/workflows.js";
import type {ResearchProvider,ResearchSource,ResearchVerifier} from "../src/research/research-types.js";
import {SandboxedGitAdapter} from "../src/tools/git-adapter.js";

const source=(id:string,domain:string,content:string):ResearchSource=>({
  id,url:"https://"+domain+"/page",title:domain,retrievedAt:new Date().toISOString(),content,contentHash:id
});

function mockResearch(){
  const text="The Pacific Ocean is the largest ocean on Earth by surface area.";
  const initial=[source("a","one.example",text),source("b","two.example",text)];
  const extra=[source("c","three.example",text)];
  const provider:ResearchProvider={search:async()=>initial};
  const verifier:ResearchVerifier={crossReference:async(_q,excluded)=>extra.filter(s=>!excluded.includes(s.url))};
  return {provider,verifier};
}

describe("research workflow",()=>{
  it("plans discover → verify → promote → brief with dependency order",()=>{
    const steps=researchToBriefWorkflow("oceans");
    expect(steps.map(s=>s.key)).toEqual(["discover","verify","promote","brief"]);
    expect(steps[1]!.dependsOn).toEqual(["discover"]);
    expect(steps[2]!.permissions).toContain("write");
    expect(steps[3]!.permissions).toEqual(["read"]);
  });

  it("runs the vertical workflow and exposes research.topic tool",async()=>{
    const brain=new AIBrain();
    const project=brain.createProject("research-flow");
    const {provider,verifier}=mockResearch();
    brain.configureResearch(provider,verifier);

    const planned=brain.planResearch(project.id,"oceans");
    expect(planned).toHaveLength(4);
    expect(planned[0]!.status).toBe("queued");

    const workflow=await brain.runResearchWorkflow(project.id,"oceans",0);
    expect(workflow.brief.facts.length).toBeGreaterThan(0);
    expect(workflow.brief.summary.toLowerCase()).toContain("pacific");

    const agent={id:"r",name:"r",description:"",capabilities:["research"],permissions:["read"] as const,authority:0 as const,canHandle:()=>true,execute:async()=>({status:"completed" as const,summary:"ok"})};
    brain.registerAgent(agent);
    const task=planned[0]!;
    task.status="running";
    task.risk="medium";
    task.assignedAgent="r";
    const toolResult=await brain.tools.execute({
      taskId:task.id,agentId:"r",toolName:"research.topic",permissions:[],taskPermissions:["read"],risk:"medium",
      input:{projectId:project.id,topic:"oceans",maxRelated:0}
    },agent);
    expect(toolResult).toMatchObject({topic:"oceans"});
  });
});

describe("semantic memory",()=>{
  it("hybrid search ranks related memories higher after embedding index",async()=>{
    const brain=new AIBrain();
    brain.configureSemanticMemory();
    const project=brain.createProject("sem");
    brain.remember({projectId:project.id,type:"fact",content:"Pacific Ocean is the largest ocean",tags:["ocean"],source:"test",confidence:0.9,importance:0.8});
    brain.remember({projectId:project.id,type:"fact",content:"Unrelated cooking recipe for pasta",tags:["food"],source:"test",confidence:0.9,importance:0.8});
    await new Promise(r=>setTimeout(r,30));
    const hits=await brain.memory.retrieveHybrid(project.id,"largest ocean body",5);
    expect(hits[0]?.content.toLowerCase()).toContain("pacific");
  });
});

describe("git sandbox",()=>{
  it("reads and lists files inside the root and blocks path escape",async()=>{
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),"brain-git-"));
    await fs.writeFile(path.join(dir,"readme.txt"),"hello brain");
    await fs.mkdir(path.join(dir,"src"));
    await fs.writeFile(path.join(dir,"src","main.ts"),"export const x=1");
    spawnSync("git",["init"],{cwd:dir});
    spawnSync("git",["config","user.email","test@example.com"],{cwd:dir});
    spawnSync("git",["config","user.name","test"],{cwd:dir});
    spawnSync("git",["add","."],{cwd:dir});
    spawnSync("git",["commit","-m","init"],{cwd:dir});

    const adapter=new SandboxedGitAdapter({root:dir});
    const file=await adapter.read("readme.txt");
    expect(file.content).toBe("hello brain");
    const listed=await adapter.list(".",2);
    expect(listed.some(e=>e.path==="src/main.ts")).toBe(true);
    await expect(adapter.read("../outside.txt")).rejects.toThrow(/sandbox/i);

    const brain=new AIBrain();
    brain.configureGit({root:dir});
    const agent={id:"dev",name:"dev",description:"",capabilities:["coding"],permissions:["read"] as const,authority:1 as const,canHandle:()=>true,execute:async()=>({status:"completed" as const,summary:"ok"})};
    brain.registerAgent(agent);
    const project=brain.createProject("git");
    const task={id:"t1",projectId:project.id,title:"read",description:"",type:"coding",status:"running" as const,dependencies:[],risk:"low" as const,permissions:["read"] as const,acceptanceCriteria:[],attempts:0,assignedAgent:"dev",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    brain.store.tasks.set(task.id,task);
    const result=await brain.tools.execute({taskId:task.id,agentId:"dev",toolName:"repo.read",permissions:[],taskPermissions:["read"],risk:"low",input:{path:"readme.txt"}},agent);
    expect(result).toMatchObject({path:"readme.txt",content:"hello brain"});

    const status=await brain.tools.execute({taskId:task.id,agentId:"dev",toolName:"repo.status",permissions:[],taskPermissions:["read"],risk:"low",input:{}},agent);
    expect(String((status as {status:string}).status)).toContain("##");
  });
});
