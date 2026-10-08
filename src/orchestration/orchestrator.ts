import {id,now} from "../core/id.js";
import type {AgentRegistry} from "../agents/registry.js";
import type {BrainStore} from "../core/store.js";
import type {AgentResult,BrainRequest,Task} from "../domain/types.js";
import {PolicyEngine} from "../policy/policy-engine.js";
import {ContextCompiler} from "../context/context-compiler.js";
import {ApprovalManager} from "../core/approval-manager.js";
import {ReviewEngine} from "../review/review-engine.js";
import {ToolGateway} from "../tools/tool-gateway.js";
export class Orchestrator {
  constructor(private store:BrainStore,private agents:AgentRegistry,private policy:PolicyEngine,private compiler:ContextCompiler,private approvals:ApprovalManager,private reviews:ReviewEngine,private toolGateway:ToolGateway){}
  async run(req:BrainRequest):Promise<AgentResult>{
    const task:Task={id:id(),projectId:req.projectId,title:req.goal,description:req.goal,type:"goal",status:"queued",dependencies:[],risk:req.risk??"low",permissions:req.permissions??["read"],acceptanceCriteria:req.acceptanceCriteria??["Produce a structured result"],budget:req.budget??{maxAttempts:3},attempts:0,createdAt:now(),updatedAt:now()};
    this.store.tasks.set(task.id,task);this.emit("task.created",task.id,{goal:req.goal});return this.executeTask(task,false);
  }
  async runTask(taskId:string):Promise<AgentResult>{
    const task=this.store.getTask(taskId);if(!task)return{status:"blocked",summary:"Task not found."};
    if(task.status!=="queued")return{status:task.status==="completed"?"completed":task.status==="failed"?"failed":"blocked",summary:task.error??"Task is not queued."};
    return this.executeTask(task,false);
  }
  async resumeApproved(taskId:string,approvalId:string):Promise<AgentResult>{
    const task=this.store.getTask(taskId),approval=this.store.approvals.get(approvalId);
    if(!task||!approval||approval.taskId!==taskId||approval.projectId!==task.projectId)return{status:"blocked",summary:"Task or approval not found."};
    if(approval.status!=="approved")return{status:"blocked",summary:"Approval is not approved."};
    if(approval.action!=="execute task"||approval.risk!==task.risk)return{status:"blocked",summary:"Approval no longer matches the task risk or action."};
    return this.executeTask(task,true);
  }
  async runReady(projectId:string,maxTasks=10){
    const ready=this.store.projectTasks(projectId).filter(t=>t.status==="queued"&&t.dependencies.every(d=>this.store.getTask(d)?.status==="completed")).slice(0,Math.max(0,maxTasks));
    const results=[];for(const task of ready)results.push(await this.executeTask(task,false));return results;
  }
  private async executeTask(task:Task,approved:boolean):Promise<AgentResult>{
    const agent=this.agents.select(task);if(!agent)return this.block(task,"No authorized agent can handle this task.");
    task.assignedAgent=agent.id;
    const decision=this.policy.evaluateTask(task,agent.authority,agent.permissions,approved);
    if(!decision.allowed){
      if(decision.requiresApproval){
        const existing=this.store.pendingApprovals(task.projectId).find(a=>a.taskId===task.id);
        const approval=existing??this.approvals.request(task.id,task.projectId,"execute task",decision.reason,task.risk,agent.id);
        this.block(task,decision.reason);return{status:"blocked",summary:decision.reason+" Approval requested: "+approval.id};
      }
      return this.block(task,decision.reason);
    }
    if(task.attempts >= (task.budget?.maxAttempts??3))return this.block(task,"Task attempt budget exhausted.");
    task.attempts++;task.status="running";task.updatedAt=now();this.emit("task.started",task.id,{agent:agent.id,attempt:task.attempts});
    try{
      const context=this.compiler.compile(task),runtime=this.toolGateway.runtime(task,agent);context.allowedTools=runtime.allowedTools;context.toolRuntime=runtime;
      const result=await agent.execute(context),review=this.reviews.evaluate(context,result);
      this.store.events.push({id:id(),type:"task.reviewed",timestamp:now(),projectId:task.projectId,taskId:task.id,actor:"review-engine",data:{passed:review.passed,score:review.score,findings:review.findings}});
      // Quality gate only applies to completed agent work. Failed/blocked agent
      // results must keep their original summaries (tool limits, policy denials, etc.).
      if(result.status==="completed"&&!review.passed){
        task.status="failed";task.error="Quality gate failed.";task.output={result,review};task.updatedAt=now();this.emit("task.failed",task.id,{reason:task.error});return{status:"failed",summary:task.error,output:{result,review}};
      }
      task.status=result.status==="completed"?"completed":result.status==="blocked"?"blocked":"failed";task.output=result.output;if(result.status!=="completed")task.error=result.summary;task.updatedAt=now();this.emit("task."+task.status,task.id,{agent:agent.id,summary:result.summary});return result;
    }catch(e){task.status="failed";task.error=e instanceof Error?e.message:String(e);task.updatedAt=now();this.emit("task.failed",task.id,{error:task.error});return{status:"failed",summary:task.error};}
  }
  private block(task:Task,reason:string):AgentResult{task.status="blocked";task.error=reason;task.updatedAt=now();this.emit("task.blocked",task.id,{reason});return{status:"blocked",summary:reason}}
  private emit(type:string,taskId:string,data:Record<string,unknown>){const task=this.store.getTask(taskId);this.store.events.push({id:id(),type,timestamp:now(),projectId:task?.projectId,taskId,actor:"orchestrator",data});}
}
