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
import type {AgentDefinition,BrainRequest,Memory,Project} from "./domain/types.js";
import {createBrainVisualSnapshot} from "./visual/brain-snapshot.js";

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
    this.taskGraph=new TaskGraph(this.store);
    this.planner=new TaskPlanner(this.store);
    this.orchestrator=new Orchestrator(this.store,this.agents,this.policy,new ContextCompiler(this.store),this.approvals,this.reviews,this.tools);
    this.scheduler=new TaskScheduler(this);
    this.worker=new BrainWorker(this);
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
  stopAll(){this.policy.stopAll()}
  resume(){this.policy.resume()}
  persist(persistence:PostgresPersistence){return persistence.flush(this.store)}
  load(persistence:PostgresPersistence){return persistence.load(this.store)}
  visualSnapshot(){return createBrainVisualSnapshot(this.store)}
}
