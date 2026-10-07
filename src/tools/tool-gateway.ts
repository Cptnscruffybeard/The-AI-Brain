import type {AgentDefinition,Task,ToolDefinition,ToolRequest} from "../domain/types.js";
import type {BrainStore} from "../core/store.js";
import type {PolicyEngine} from "../policy/policy-engine.js";
import {id,now} from "../core/id.js";

export class ToolGateway {
  private tools=new Map<string,ToolDefinition>();

  constructor(private store:BrainStore,private policy:PolicyEngine){}

  register(t:ToolDefinition){
    if(!t.name.trim())throw new Error("Tool name is required.");
    if(typeof t.execute!=="function")throw new Error("Tool executor is required.");
    if(t.requiredPermissions.some(p=>!["read","write","execute","deploy-staging","deploy-production","financial","legal","destructive","security-policy"].includes(p)))throw new Error("Tool contains an invalid permission.");
    if(this.tools.has(t.name))throw new Error("Tool already exists: "+t.name);
    this.tools.set(t.name,t);
  }

  list(){return[...this.tools.values()]}

  allowedFor(task:Task,agent:AgentDefinition){
    return this.list()
      .filter(tool=>tool.risk!=="critical"&&!toolRiskAbove(tool.risk,task.risk))
      .filter(tool=>tool.requiredPermissions.every(p=>agent.permissions.includes(p)&&task.permissions.includes(p)))
      .map(t=>t.name);
  }

  async execute(r:ToolRequest,a:AgentDefinition){
    if(r.agentId!==a.id)throw new Error("Tool request agent identity mismatch.");
    const task=this.store.getTask(r.taskId);
    if(!task)throw new Error("Unknown task: "+r.taskId);
    if(task.assignedAgent&&task.assignedAgent!==a.id)throw new Error("Agent is not assigned to the task.");
    if(task.status!=="running")throw new Error("Tools may only be executed for a running task.");
    if(r.taskPermissions.some(p=>!task.permissions.includes(p)))throw new Error("Tool request exceeds the task permission envelope.");
    const tool=this.tools.get(r.toolName);
    if(!tool)throw new Error("Unknown tool: "+r.toolName);

    const permissions=tool.requiredPermissions;
    const decision=this.policy.evaluateTool({...r,permissions,risk:tool.risk},a.authority,tool.risk,a.permissions);
    this.store.events.push({id:id(),type:decision.allowed?"tool.allowed":"tool.blocked",timestamp:now(),projectId:task.projectId,taskId:r.taskId,actor:a.id,data:{tool:r.toolName,reason:decision.reason}});
    if(!decision.allowed)throw new Error("Tool blocked by policy: "+decision.reason);

    const result=await tool.execute(r.input);
    this.store.events.push({id:id(),type:"tool.completed",timestamp:now(),projectId:task.projectId,taskId:r.taskId,actor:a.id,data:{tool:r.toolName}});
    return result;
  }

  runtime(task:Task,agent:AgentDefinition){
    const allowed=this.allowedFor(task,agent);
    return {
      allowedTools:allowed,
      execute:(toolName:string,input:unknown)=>{
        if(!allowed.includes(toolName))return Promise.reject(new Error("Tool is not in the task's allowed tool set."));
        return this.execute({taskId:task.id,agentId:agent.id,toolName,permissions:[],taskPermissions:task.permissions,risk:task.risk,input},agent);
      }
    };
  }
}

function toolRiskAbove(toolRisk:Task["risk"],taskRisk:Task["risk"]){
  const rank={low:0,medium:1,high:2,critical:3};
  return rank[toolRisk]>rank[taskRisk];
}
