import type {BrainVisualSnapshot} from "./brain-snapshot.js";

export type BrainVisualNodeType = "project"|"goal"|"decision"|"memory"|"artifact"|"task"|"event"|"approval";
export type BrainVisualEdgeType = "project"|"dependency"|"parent"|"reference"|"event"|"supersedes"|"approval";

export interface BrainVisualNode { id:string; type:BrainVisualNodeType; label:string; projectId?:string; status?:string; metadata:Record<string,unknown>; }
export interface BrainVisualEdge { id:string; source:string; target:string; type:BrainVisualEdgeType; label?:string; }
export interface BrainVisualGraph { version:1; generatedAt:string; nodes:BrainVisualNode[]; edges:BrainVisualEdge[]; }

export function createBrainVisualGraph(s:BrainVisualSnapshot):BrainVisualGraph {
 const nodes:BrainVisualNode[]=[]; const edges:BrainVisualEdge[]=[];
 const add=(type:BrainVisualNodeType,items:any[],label:(x:any)=>string)=>{for(const x of items)nodes.push({id:x.id,type,label:label(x),projectId:x.projectId,status:x.status,metadata:x});};
 add("project",s.projects,x=>x.name); add("goal",s.goals,x=>x.text); add("decision",s.decisions,x=>x.text);
 add("memory",s.memories,x=>x.content); add("artifact",s.artifacts,x=>x.name); add("task",s.tasks,x=>x.title);
 add("event",s.events,x=>x.type); add("approval",s.approvals,x=>x.action);
 const ids=new Set(nodes.map(n=>n.id)),seen=new Set<string>();
 const edge=(source:string,target:string,type:BrainVisualEdgeType,label?:string)=>{if(!ids.has(source)||!ids.has(target)||source===target)return;const key=source+"|"+target+"|"+type;if(seen.has(key))return;seen.add(key);edges.push({id:key,source,target,type,label});};
 for(const n of nodes)if(n.projectId)edge(n.projectId,n.id,"project");
 for(const t of s.tasks){for(const d of t.dependencies||[])edge(d,t.id,"dependency","depends on");if(t.parentTaskId)edge(t.parentTaskId,t.id,"parent","parent");}
 for(const m of s.memories)if(m.supersededBy)edge(m.id,m.supersededBy,"supersedes","supersedes");
 for(const a of s.approvals)edge(a.taskId,a.id,"approval","approval");
 for(const e of s.events){if(e.taskId)edge(e.id,e.taskId,"event","task event");for(const id of [e.data?.memoryId,e.data?.decisionId,e.data?.goalId,e.data?.artifactId].filter((x):x is string=>typeof x==="string"))edge(e.id,id,"reference","references");}
 return {version:1,generatedAt:s.generatedAt,nodes,edges};
}
