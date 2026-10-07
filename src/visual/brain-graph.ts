import type {Artifact,ApprovalRequest,BrainEvent,Decision,Goal,Memory,Project,Task} from "../domain/types.js";
import type {BrainVisualSnapshot} from "./brain-snapshot.js";

export type BrainVisualNodeType="project"|"goal"|"decision"|"memory"|"artifact"|"task"|"event"|"approval";
export type BrainVisualEdgeType="project"|"dependency"|"parent"|"reference"|"event"|"supersedes"|"approval";
export interface BrainVisualNode{id:string;type:BrainVisualNodeType;label:string;projectId?:string;status?:string;metadata:Record<string,unknown>}
export interface BrainVisualEdge{id:string;source:string;target:string;type:BrainVisualEdgeType;label?:string}
export interface BrainVisualGraph{version:1;generatedAt:string;nodes:BrainVisualNode[];edges:BrainVisualEdge[]}

type VisualEntity=Project|Goal|Decision|Memory|Artifact|Task|BrainEvent|ApprovalRequest;
const allowed:Record<BrainVisualNodeType,readonly string[]>={
 project:["id","name","description","status"],goal:["id","projectId","text","risk","createdAt"],decision:["id","projectId","text","rationale","status","createdAt"],
 memory:["id","projectId","type","content","tags","source","confidence","importance","createdAt","supersededBy"],artifact:["id","projectId","name","uri","kind"],
 task:["id","projectId","parentTaskId","title","description","type","status","dependencies","assignedAgent","risk","permissions","acceptanceCriteria","attempts","createdAt","updatedAt"],
 event:["id","type","timestamp","projectId","taskId","actor"],approval:["id","taskId","projectId","action","reason","risk","status","requestedBy","decidedBy","createdAt","decidedAt"]
};
const nodeId=(type:BrainVisualNodeType,id:string)=>type+":"+id;
function metadataFor(type:BrainVisualNodeType,x:VisualEntity){
 const source=x as unknown as Record<string,unknown>;const out:Record<string,unknown>={};
 for(const key of allowed[type])if(key in source)out[key]=source[key];
 return out;
}
function addNode(nodes:BrainVisualNode[],type:BrainVisualNodeType,x:VisualEntity,label:string){
 const node:BrainVisualNode={id:nodeId(type,x.id),type,label:label||x.id,metadata:metadataFor(type,x)};
 if("projectId" in x&&typeof x.projectId==="string")node.projectId=x.projectId;
 if("status" in x&&typeof x.status==="string")node.status=x.status;
 nodes.push(node);
}
export function createBrainVisualGraph(s:BrainVisualSnapshot):BrainVisualGraph{
 const nodes:BrainVisualNode[]=[];const edges:BrainVisualEdge[]=[];
 for(const x of s.projects)addNode(nodes,"project",x,x.name);
 for(const x of s.goals)addNode(nodes,"goal",x,x.text);
 for(const x of s.decisions)addNode(nodes,"decision",x,x.text);
 for(const x of s.memories)addNode(nodes,"memory",x,x.content);
 for(const x of s.artifacts)addNode(nodes,"artifact",x,x.name);
 for(const x of s.tasks)addNode(nodes,"task",x,x.title);
 for(const x of s.events)addNode(nodes,"event",x,x.type);
 for(const x of s.approvals)addNode(nodes,"approval",x,x.action);

 const ids=new Set(nodes.map(n=>n.id));const seen=new Set<string>();
 const ref=(type:BrainVisualNodeType,id:string)=>nodeId(type,id);
 const edge=(source:string,target:string,type:BrainVisualEdgeType,label?:string)=>{
  if(!ids.has(source)||!ids.has(target)||source===target)return;
  const key=source+"|"+target+"|"+type;if(seen.has(key))return;seen.add(key);
  const value:BrainVisualEdge={id:key,source,target,type};if(label)value.label=label;edges.push(value);
 };
 for(const n of nodes)if(n.projectId)edge(ref("project",n.projectId),n.id,"project");
 for(const t of s.tasks){
  for(const dependency of t.dependencies)edge(ref("task",dependency),ref("task",t.id),"dependency","depends on");
  if(t.parentTaskId)edge(ref("task",t.parentTaskId),ref("task",t.id),"parent","parent");
 }
 for(const m of s.memories)if(m.supersededBy)edge(ref("memory",m.id),ref("memory",m.supersededBy),"supersedes","supersedes");
 for(const a of s.approvals)edge(ref("task",a.taskId),ref("approval",a.id),"approval","approval");
 for(const e of s.events){
  if(e.taskId)edge(ref("event",e.id),ref("task",e.taskId),"event","task event");
  for(const [key,type] of [["memoryId","memory"],["decisionId","decision"],["goalId","goal"],["artifactId","artifact"]] as const){
   const value=e.data[key];if(typeof value==="string")edge(ref("event",e.id),ref(type,value),"reference","references");
  }
 }
 return{version:1,generatedAt:s.generatedAt,nodes,edges};
}
