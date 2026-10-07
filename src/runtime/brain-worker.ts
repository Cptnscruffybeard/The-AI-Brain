import {id,now} from "../core/id.js";
import type {BrainEvent,AgentResult,Task} from "../domain/types.js";
import type {AIBrain} from "../brain.js";
export interface BrainWorkerOptions{workerId?:string;maxConcurrent?:number;leaseMs?:number;maxTicks?:number}
export interface WorkerTickResult{claimed:number;completed:number;failed:number;blocked:number;recovered:number}
export class BrainWorker{
 readonly workerId:string;private running=false;private readonly options:Required<Omit<BrainWorkerOptions,"workerId">>;
 constructor(private brain:AIBrain,options:BrainWorkerOptions={}){this.workerId=options.workerId??id();this.options={maxConcurrent:Math.max(1,options.maxConcurrent??2),leaseMs:Math.max(1000,options.leaseMs??30000),maxTicks:Math.max(1,options.maxTicks??100)}}
 async tick(projectId:string):Promise<WorkerTickResult>{
  const nowMs=Date.now();let recovered=0;
  for(const task of this.brain.store.projectTasks(projectId)){if(task.status==="running"&&task.lease&&task.lease.expiresAt<=nowMs){delete task.lease;task.status="queued";task.error="Recovered from expired worker lease.";task.updatedAt=now();this.emit("worker.task.recovered",task,{workerId:this.workerId});recovered++}}
  const ready=this.brain.store.claimReadyTasks(projectId,this.workerId,this.options.leaseMs,this.options.maxConcurrent);
  const results=await Promise.all(ready.map(async task=>{try{return await this.brain.orchestrator.runTask(task.id)}finally{this.brain.store.releaseTask(task,this.workerId)}}));
  let completed=0,failed=0,blocked=0;for(const result of results){if(result.status==="completed")completed++;else if(result.status==="failed")failed++;else blocked++}
  return{claimed:ready.length,completed,failed,blocked,recovered};
 }
 async runUntilIdle(projectId:string,maxTicks=this.options.maxTicks):Promise<AgentResult[]>{const results:AgentResult[]=[];for(let i=0;i<maxTicks;i++){const tick=await this.tick(projectId);if(!tick.claimed&&!tick.recovered)break;if(!this.hasRunnableWork(projectId))break}return results}
 async start(projectId:string,intervalMs=1000):Promise<void>{if(this.running)return;this.running=true;while(this.running){await this.tick(projectId);if(this.running)await new Promise(resolve=>setTimeout(resolve,Math.max(50,intervalMs)))}}
 stop(){this.running=false}
 claimedTasks(){return this.brain.store.projectTasks(this.brain.store.projects.keys().next().value??"").filter(t=>t.lease?.workerId===this.workerId).map(t=>t.id)}
 async wake(){for(const projectId of this.brain.store.projects.keys())await this.tick(projectId)}
 private hasRunnableWork(projectId:string){return this.brain.store.projectTasks(projectId).some(t=>t.status==="queued"&&(!t.lease||t.lease.expiresAt<=Date.now())&&t.dependencies.every(d=>this.brain.store.getTask(d)?.status==="completed"))}
 private emit(type:string,task:Task,data:Record<string,unknown>){const event:BrainEvent={id:id(),type,timestamp:now(),projectId:task.projectId,taskId:task.id,actor:"worker:"+this.workerId,data};this.brain.store.events.push(event)}
}
