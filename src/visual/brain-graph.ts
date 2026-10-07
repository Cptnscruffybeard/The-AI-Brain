import type {Artifact,ApprovalRequest,BrainEvent,Decision,Goal,Memory,Project,Task} from "../domain/types.js";
import type {BrainVisualSnapshot} from "./brain-snapshot.js";
export type BrainVisualNodeType="project"|"goal"|"decision"|"memory"|"artifact"|"task"|"event"|"approval";
export type BrainVisualEdgeType="project"|"dependency"|"parent"|"reference"|"event"|"supersedes"|"approval";
export interface BrainVisualNode{id:string;type:BrainVisualNodeType;label:string;projectId?:string;status?:string;metadata:Record<string,unknown>}
export interface BrainVisualEdge{id:string;source:string;target:string;type:BrainVisualEdgeType;label?:string}
export interface BrainVisualGraph{version:1;generatedAt:string;nodes:BrainVisualNode[];edges:BrainVisualEdge[]}
type Entity=Project|Goal|Decision|Memory|Artifact|Task|BrainEvent|ApprovalRequest;
const fields:Record<BrainVisualNodeType,string[]>={project:["id","name","description","status"],goal:["id","projectId","text","risk","createdAt"],decision:["id","projectId","text","rationale","status","createdAt"],memory:["id","projectId","type","content","tags","source","confidence","importance","createdAt","supersededBy"],artifact:["id","projectId","name","uri","kind"],task:["id","projectId","parentTaskId","title","description","type","status","dependencies","assignedAgent","risk","permissions","acceptanceCriteria","attempts","createdAt","updatedAt"],event:["id","type","timestamp","projectId","taskId","actor"],approval:["id","taskId","projectId","action","reason","risk","status","requestedBy","decidedBy","createdAt","decidedAt"]};
const nodeId=(type:BrainVisualNodeType,id:string)=>type+":"+id;
function metadataFor(type:BrainVisualNodeType,x:Entity):Record<string,unknown>{const out:Record<string,unknown>={};for(const key of fields[type])if(key in x)out[key]=(x as unknown as Record<string,unknown>)[key];return out}
export function createBrainVisualGraph(s:BrainVisualSnapshot):BrainVisualGraph{
 const nodes:BrainVisualNode[]=[];const edges:BrainVisualEdge[]=[];
 const add=(type:BrainVisualNodeType,items:Entity[],label:(x:Entity)=>string)=>{for(const x of items){const raw=String(x.id);nodes.push({id:nodeId(type,raw),type,label:label(x)||raw,projectId:"projectId"in x&&typeof x.projectId==="string"?x.projectId:undefined,status:"status"in x&&typeof x.status==="string"?x.status:undefined,metadata:metadataFor(type,x)})}};
 add("project",s.projects as Project[],x=>String((x as Project).name));add("goal",s.goals as Goal[],x=>String((x as Goal).text));add("decision",s.decisions as Decision[],x=>String((x as Decision).text));add("memory",s.memories as Memory[],x=>String((x as Memory).content));add("artifact",s.artifacts as Artifact[],x=>String((x as Artifact).name));add("task",s.tasks as Task[],x=>String((x as Task).title));add("event",s.events as BrainEvent[],x=>String((x as BrainEvent).type));add("approval",s.approvals as ApprovalRequest[],x=>String((x as ApprovalRequest).action));
 const ids=new Set(nodes.map(n=>n.id)),seen=new Set<string>();const ref=(type:BrainVisualNodeType,id:string)=>nodeId(type,id);
 const edge=(source:string,target:string,type:BrainVisualEdgeType,label?:string)=>{if(!ids.has(source)||!ids.has(target)||source===target)return;const key=source+"|"+target+"|"+type;if(seen.has(key))return;seen.add(key);edges.push({id:key,source,target,type,label})};
 for(const n of nodes)if(n.projectId)edge(ref("project",n.projectId),n.id,"project");
 for(const t of s.tasks){for(const d of t.dependencies||[])edge(ref("task",d),ref("task",t.id),"dependency","depends on");if(t.parentTaskId)edge(ref("task",t.parentTaskId),ref("task",t.id),"parent","parent")}
 for(const m of s.memories)if(m.supersededBy)edge(ref("memory",m.id),ref("memory",m.supersededBy),"supersedes","supersedes");
 for(const a of s.approvals)edge(ref("task",a.taskId),ref("approval",a.id),"approval","approval");
 for(const e of s.events){if(e.taskId)edge(ref("event",e.id),ref("task",e.taskId),"event","task event");const data=e.data;for(const [key,type] of [["memoryId","memory"],["decisionId","decision"],["goalId","goal"],["artifactId","artifact"]] as const){const value=data[key];if(typeof value==="string")edge(ref("event",e.id),ref(type,value),"reference","references")}}
 return{version:1,generatedAt:s.generatedAt,nodes,edges};
}
