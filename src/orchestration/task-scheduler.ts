import type {AIBrain} from "../brain.js";
import type {AgentResult,Task} from "../domain/types.js";

export interface SchedulerOptions { maxConcurrent?:number; }

export class TaskScheduler {
  constructor(private brain:AIBrain,private options:SchedulerOptions={}){}

  async tick(projectId:string):Promise<AgentResult[]>{
    const maxConcurrent=Math.max(1,this.options.maxConcurrent??2);
    const ready=this.brain.store.projectTasks(projectId)
      .filter(t=>t.status==="queued"&&t.dependencies.every(d=>this.brain.store.getTask(d)?.status==="completed"));
    const results:AgentResult[]=[];
    for(let i=0;i<ready.length;i+=maxConcurrent){
      const batch=ready.slice(i,i+maxConcurrent);
      const batchResults=await Promise.all(batch.map(task=>this.brain.orchestrator.runTask(task.id)));
      results.push(...batchResults);
    }
    return results;
  }

  async drain(projectId:string,maxTicks=100):Promise<AgentResult[]>{
    const all:AgentResult[]=[];
    for(let tick=0;tick<maxTicks;tick++){
      const pending=this.brain.store.projectTasks(projectId).filter(t=>t.status==="queued");
      if(!pending.length)break;
      const results=await this.tick(projectId);
      all.push(...results);
      if(!results.length)break;
    }
    return all;
  }

  queued(projectId:string):Task[]{return this.brain.store.projectTasks(projectId).filter(t=>t.status==="queued")}
}
