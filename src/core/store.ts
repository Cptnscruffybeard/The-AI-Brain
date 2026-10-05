import type {AgentDefinition,Artifact,BrainEvent,Decision,Goal,Memory,Project,Task} from "../domain/types.js";
export class BrainStore {
 projects=new Map<string,Project>(); goals=new Map<string,Goal>(); decisions=new Map<string,Decision>(); memories=new Map<string,Memory>(); artifacts=new Map<string,Artifact>(); tasks=new Map<string,Task>(); agents=new Map<string,AgentDefinition>(); events:BrainEvent[]=[];
 getProject(id:string){return this.projects.get(id)}
 getTask(id:string){return this.tasks.get(id)}
 projectMemories(projectId:string){return [...this.memories.values()].filter(m=>!m.projectId||m.projectId===projectId)}
 projectDecisions(projectId:string){return [...this.decisions.values()].filter(d=>d.projectId===projectId&&d.status==="active")}
}