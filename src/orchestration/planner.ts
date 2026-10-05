import {id,now} from "../core/id.js";
import type {BrainStore} from "../core/store.js";
import type {Permission,RiskLevel,Task} from "../domain/types.js";

export interface PlanStep {
  key:string;
  title:string;
  description:string;
  type?:string;
  dependsOn?:string[];
  risk?:RiskLevel;
  permissions?:Permission[];
  acceptanceCriteria?:string[];
}

export class TaskPlanner {
  constructor(private store:BrainStore){}
  create(projectId:string,steps:PlanStep[]):Task[]{
    const keys=new Set<string>();
    for(const step of steps){
      if(keys.has(step.key)) throw new Error("Duplicate plan step: "+step.key);
      keys.add(step.key);
    }
    for(const step of steps){
      for(const dep of step.dependsOn??[]){
        if(!keys.has(dep)) throw new Error("Unknown plan dependency: "+dep);
        if(dep===step.key) throw new Error("Task cannot depend on itself: "+step.key);
      }
    }
    const ids=new Map<string,string>();
    for(const step of steps) ids.set(step.key,id());
    const tasks:Task[]=steps.map(step=>{
      const task:Task={
        id:ids.get(step.key)!,
        projectId,
        title:step.title,
        description:step.description,
        type:step.type??"planned",
        status:"queued",
        dependencies:(step.dependsOn??[]).map(key=>ids.get(key)!),
        risk:step.risk??"low",
        permissions:step.permissions??["read"],
        acceptanceCriteria:step.acceptanceCriteria??["Produce a structured result"],
        budget:{maxAttempts:3},
        attempts:0,
        createdAt:now(),
        updatedAt:now()
      };
      this.store.tasks.set(task.id,task);
      this.store.events.push({id:id(),type:"task.planned",timestamp:now(),projectId,taskId:task.id,actor:"planner",data:{key:step.key,title:step.title,dependencies:task.dependencies}});
      return task;
    });
    if(this.hasCycle(tasks)) throw new Error("Plan contains a dependency cycle.");
    return tasks;
  }
  private hasCycle(tasks:Task[]){
    const graph=new Map(tasks.map(t=>[t.id,t.dependencies]));
    const visiting=new Set<string>(),visited=new Set<string>();
    const visit=(node:string):boolean=>{
      if(visiting.has(node)) return true;
      if(visited.has(node)) return false;
      visiting.add(node);
      for(const dep of graph.get(node)??[]) if(visit(dep)) return true;
      visiting.delete(node); visited.add(node); return false;
    };
    return tasks.some(t=>visit(t.id));
  }
}
