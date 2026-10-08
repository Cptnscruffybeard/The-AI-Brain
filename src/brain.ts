import {id,now} from "./core/id.js";
import {BrainStore} from "./core/store.js";
import {MemoryService} from "./core/memory-service.js";
import {ApprovalManager} from "./core/approval-manager.js";
import {AgentRegistry} from "./agents/registry.js";
import {PolicyEngine} from "./policy/policy-engine.js";
import {ContextCompiler} from "./context/context-compiler.js";
import {Orchestrator} from "./orchestration/orchestrator.js";
import {TaskScheduler} from "./orchestration/task-scheduler.js";
import {BrainWorker} from "./runtime/brain-worker.js";
import {ToolGateway} from "./tools/tool-gateway.js";
import {TaskGraph} from "./orchestration/task-graph.js";
import {TaskPlanner} from "./orchestration/planner.js";
import type {PlanStep} from "./orchestration/planner.js";
import {ReviewEngine} from "./review/review-engine.js";
import {ModelRouter} from "./model/model-router.js";
import {PostgresPersistence} from "./persistence/postgres-persistence.js";
import {createStandardAgents} from "./agents/standard-agents.js";
import type {ModelProvider,ModelRequest} from "./domain/types.js";
import type {AgentDefinition,BrainRequest,Memory,Project,Task} from "./domain/types.js";
import {createBrainVisualSnapshot} from "./visual/brain-snapshot.js";
import {createBrainVisualGraph} from "./visual/brain-graph.js";
import {ResearchEngine} from "./research/research-engine.js";
import type {ResearchConfig,ResearchProvider,ResearchVerifier} from "./research/research-types.js";
import {SearchBackedCrawler} from "./research/search-backed-crawler.js";

export class AIBrain {
  readonly store=new BrainStore();
  readonly memory:MemoryService;
  readonly agents=new AgentRegistry();
  readonly policy=new PolicyEngine();
  readonly tools:ToolGateway;
  readonly taskGraph:TaskGraph;
  readonly planner:TaskPlanner;
  readonly approvals:ApprovalManager;
  readonly reviews:ReviewEngine;
  readonly orchestrator:Orchestrator;
  readonly scheduler:TaskScheduler;
  readonly worker:BrainWorker;
  readonly models=new ModelRouter();
  research?:ResearchEngine;

  constructor(){
    this.memory=new MemoryService(this.store);
    this.approvals=new ApprovalManager(this.store);
    this.reviews=new ReviewEngine();
    this.reviews.register((ctx,result)=>{
      if(result.status!=="completed") return;
      const missing=ctx.task.acceptanceCriteria.filter((criterion:string)=>!result.summary.toLowerCase().includes(criterion.toLowerCase()));
      return missing.length?{severity:"warning",message:"Acceptance criteria were not explicitly referenced in the result: "+missing.join("; "),source:"acceptance-gate"}:undefined;
    });
    this.tools=new ToolGateway(this.store,this.policy);
    this.registerCoreTools();
    this.taskGraph=new TaskGraph(this.store);
    this.planner=new TaskPlanner(this.store);
    this.orchestrator=new Orchestrator(this.store,this.agents,this.policy,new ContextCompiler(this.store),this.approvals,this.reviews,this.tools);
    this.scheduler=new TaskScheduler(this);
    this.worker=new BrainWorker(this);
  }

  private registerCoreTools(){
    this.tools.register({name:"task.inspect",description:"Inspect the current task and its safe execution state.",risk:"low",requiredPermissions:["read"],execute:async(input)=>{const id=typeof input==="object"&&input!==null&&"taskId" in input?String((input as {taskId:unknown}).taskId):"";const task=this.store.getTask(id);if(!task)throw new Error("Unknown task.");return {id:task.id,title:task.title,description:task.description,status:task.status,risk:task.risk,permissions:task.permissions,acceptanceCriteria:task.acceptanceCriteria,attempts:task.attempts,dependencies:task.dependencies};}});
    this.tools.register({name:"project.inspect",description:"Inspect the current project metadata.",risk:"low",requiredPermissions:["read"],execute:async(input)=>{const id=typeof input==="object"&&input!==null&&"projectId" in input?String((input as {projectId:unknown}).projectId):"";const project=this.store.getProject(id);if(!project)throw new Error("Unknown project.");return project;}});
    this.tools.register({name:"memory.search",description:"Search governed project memory.",risk:"low",requiredPermissions:["read"],execute:async(input)=>{const q=typeof input==="object"&&input!==null&&"query" in input?String((input as {query:unknown}).query):"";const projectId=typeof input==="object"&&input!==null&&"projectId" in input?String((input as {projectId:unknown}).projectId):"";return this.memory.retrieve(projectId,q,12).map(m=>({id:m.id,type:m.type,content:m.content,tags:m.tags,confidence:m.confidence,importance:m.importance}));}});
    this.tools.register({name:"memory.remember",description:"Store a governed project memory.",risk:"medium",requiredPermissions:["write"],execute:async(input)=>{if(!input||typeof input!=="object")throw new Error("Object input required.");const x=input as Record<string,unknown>;const memory:Omit<Memory,"id"|"createdAt">={type:(x.type as Memory["type"])??"fact",content:String(x.content??""),tags:Array.isArray(x.tags)?x.tags.map(String):[],source:String(x.source??"agent"),confidence:Number(x.confidence??0.7),importance:Number(x.importance??0.5)};if(typeof x.projectId==="string")memory.projectId=x.projectId;return this.remember(memory);}});
  }

  createProject(name:string,description=""){
    const p:Project={id:id(),name,description,status:"active",createdAt:now(),updatedAt:now()};
    this.store.projects.set(p.id,p);
    return p;
  }

  remember(memory:Omit<Memory,"id"|"createdAt">){return this.memory.remember(memory)}
  supersedeMemory(oldId:string,memory:Omit<Memory,"id"|"createdAt">){return this.memory.supersede(oldId,memory)}
  registerAgent(a:AgentDefinition){this.agents.register(a)}
  registerStandardAgents(providerId:string,model:string){
    const agents=createStandardAgents(this.models,providerId,model);
    for(const agent of agents)this.registerAgent(agent);
    return agents;
  }
  request(r:BrainRequest){return this.orchestrator.run(r)}
  resumeApproved(taskId:string,approvalId:string){return this.orchestrator.resumeApproved(taskId,approvalId)}
  runReady(projectId:string,maxTasks=10){return this.orchestrator.runReady(projectId,maxTasks)}
  drain(projectId:string,maxTicks=100){return this.scheduler.drain(projectId,maxTicks)}
  plan(projectId:string,steps:PlanStep[]){return this.planner.create(projectId,steps)}
  registerModelProvider(provider:ModelProvider){this.models.register(provider)}
  completeModel(request:ModelRequest,providerId:string,model:string){return this.models.complete(request,providerId,model)}
  configureResearch(provider:ResearchProvider,verifier:ResearchVerifier,config?:ResearchConfig){this.research=new ResearchEngine(this.store,provider,verifier,config);return this.research;}
  configurePublicWebResearch(config?:ResearchConfig){
    const discovery=new SearchBackedCrawler();
    const verification=new SearchBackedCrawler();
    return this.configureResearch(discovery,verification,config);
  }
  researchTopic(projectId:string,topic:string,maxRelated=3,maxDepth=1){if(!this.research)throw new Error("Research engine is not configured.");return this.research.researchAndLearn(projectId,topic,maxRelated,maxDepth);}
  stopAll(){this.policy.stopAll()}
  resume(){this.policy.resume()}
  persist(persistence:PostgresPersistence){this.worker.attachPersistence(persistence);return persistence.flush(this.store)}
  load(persistence:PostgresPersistence){this.worker.attachPersistence(persistence);return persistence.load(this.store)}
  visualSnapshot(){return createBrainVisualSnapshot(this.store)}
  visualGraph(){return createBrainVisualGraph(this.visualSnapshot())}
}
