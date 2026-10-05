export type Id = string;
export type Timestamp = string;
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type TaskStatus = "queued" | "running" | "blocked" | "completed" | "failed" | "cancelled";
export type AuthorityLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Permission = "read" | "write" | "execute" | "deploy-staging" | "deploy-production" | "financial" | "legal" | "destructive" | "security-policy";
export interface Project { id:Id; name:string; description:string; status:"active"|"paused"|"completed"; createdAt:Timestamp; updatedAt:Timestamp; }
export interface Goal { id:Id; projectId:Id; text:string; risk:RiskLevel; createdAt:Timestamp; }
export interface Decision { id:Id; projectId:Id; text:string; rationale:string; status:"active"|"superseded"; createdAt:Timestamp; }
export interface Memory { id:Id; projectId?:Id; type:"preference"|"rule"|"decision"|"fact"|"lesson"|"assumption"|"constraint"; content:string; tags:string[]; source:string; confidence:number; importance:number; createdAt:Timestamp; supersededBy?:Id; }
export interface Artifact { id:Id; projectId:Id; name:string; uri:string; kind:"file"|"report"|"repository"|"other"; }
export interface Task { id:Id; projectId:Id; parentTaskId?:Id; title:string; description:string; type:string; status:TaskStatus; dependencies:Id[]; assignedAgent?:string; risk:RiskLevel; permissions:Permission[]; acceptanceCriteria:string[]; budget?:{maxAttempts:number;maxCost?:number}; output?:unknown; error?:string; createdAt:Timestamp; updatedAt:Timestamp; }
export interface AgentDefinition { id:string; name:string; description:string; capabilities:string[]; permissions:Permission[]; authority:AuthorityLevel; canHandle:(task:Task)=>boolean; execute:(ctx:ContextPacket)=>Promise<AgentResult>; }
export interface AgentResult { status:"completed"|"failed"|"blocked"; summary:string; output?:unknown; lessons?:string[]; }
export interface ContextPacket { task:Task; goal?:Goal; project?:Project; memories:Memory[]; decisions:Decision[]; artifacts:Artifact[]; constraints:string[]; rules:string[]; allowedTools:string[]; }
export interface PolicyDecision { allowed:boolean; reason:string; requiresApproval:boolean; authority:AuthorityLevel; }
export interface ToolDefinition { name:string; description:string; risk:RiskLevel; requiredPermissions:Permission[]; execute:(input:unknown)=>Promise<unknown>; }
export interface ToolRequest { taskId:Id; agentId:string; toolName:string; permissions:Permission[]; risk:RiskLevel; input:unknown; }
export interface BrainEvent { id:Id; type:string; timestamp:Timestamp; projectId?:Id; taskId?:Id; actor:string; data:Record<string,unknown>; }
export interface BrainRequest { projectId:Id; goal:string; risk?:RiskLevel; permissions?:Permission[]; }
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export interface ApprovalRequest { id:Id; taskId:Id; projectId:Id; action:string; reason:string; risk:RiskLevel; status:ApprovalStatus; requestedBy:string; decidedBy?:string; createdAt:Timestamp; decidedAt?:Timestamp; }
export interface ReviewFinding { severity:"info"|"warning"|"error"|"critical"; message:string; source:string; }
export interface ReviewResult { passed:boolean; score:number; findings:ReviewFinding[]; }
export interface ModelMessage { role:"system"|"user"|"assistant"|"tool"; content:string; }
export interface ModelRequest { messages:ModelMessage[]; temperature?:number; maxTokens?:number; }
export interface ModelResponse { text:string; provider:string; model:string; usage?:{inputTokens?:number;outputTokens?:number}; }
export interface ModelProvider { id:string; models():string[]; complete(request:ModelRequest,model:string):Promise<ModelResponse>; }
