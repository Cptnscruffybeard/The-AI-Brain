import {id,now} from "../core/id.js";
import type {BrainEvent,AgentResult,Task} from "../domain/types.js";
import type {AIBrain} from "../brain.js";
import type {PostgresPersistence} from "../persistence/postgres-persistence.js";
export interface BrainWorkerOptions{workerId?:string;maxConcurrent?:number;leaseMs?:number;maxTicks?:number}
export interface WorkerTickResult{claimed:number;completed:number;failed:number;blocked:number;recovered:number}
export class BrainWorker{
 readonly workerId:string;private running=false;private persistence?:PostgresPersistence;private readonly claimed=new Map<string,number>();private readonly options:Required<Omit<BrainWorkerOptions,"workerId">>;
 constructor(private brain:AIBrain,options:BrainWorkerOptions={}){this.workerId=options.workerId??id();this.options={maxConcurrent:Math.max(1,options.maxConcurrent??2),leaseMs:Math.max(1000,options.leaseMs??30000),maxTicks:Math.max(1,options.maxTicks??100)}}
 attachPersistence(persistence:PostgresPersistence){this.persistence=persistence;return this}
 async tick(projectId:string):Promise<WorkerTickResult>{
  const nowMs=Date.now();let recovered=0;let ready:Task[]=[];
  for(const task of this.brain.store.projectTasks(projectId)){const lease=this.claimed.get(task.id);if(task.status==="running"&&lease!==undefined&&lease<=nowMs){this.claimed.delete(task.id);delete task.lease;task.status="queued";task.error="Recovered from expired worker lease.";task.updatedAt=now();this.emit("worker.task.recovered",task,{workerId:this.workerId});recovered++}}
  if(this.persistence){
   const ids=await this.persistence.claimReadyTaskIds(projectId,this.workerId,this.options.leaseMs,this.options.maxConcurrent);
   ready=ids.map(taskId=>this.brain.store.getTask(taskId)).filter((t):t is Task=>!!t);
  }else ready=this.brain.store.claimReadyTasks(projectId,this.workerId,this.options.leaseMs,this.options.maxConcurrent);
  for(const task of ready){const expiresAt=nowMs+this.options.leaseMs;this.claimed.set(task.id,expiresAt);task.lease={workerId:this.workerId,expiresAt}}
  const results=await Promise.all(ready.map(async task=>{
   const heartbeat=setInterval(()=>{const expiresAt=Date.now()+this.options.leaseMs;if(this.claimed.has(task.id)){this.claimed.set(task.id,expiresAt);if(task.lease?.workerId===this.workerId)task.lease.expiresAt=expiresAt}},Math.max(250,Math.floor(this.options.leaseMs/3)));
   try{return await this.brain.orchestrator.runTask(task.id)}
   finally{clearInterval(heartbeat);if(this.persistence)await this.persistence.saveTaskLease(task,this.workerId);this.claimed.delete(task.id);this.brain.store.releaseTask(task,this.workerId)}
  }));
  let completed=0,failed=0,blocked=0;for(const result of results){if(result.status==="completed")completed++;else if(result.status==="failed")failed++;else blocked++}
  return{claimed:ready.length,completed,failed,blocked,recovered};
 }
 async runUntilIdle(projectId:string,maxTicks=this.options.maxTicks):Promise<AgentResult[]>{const results:AgentResult[]=[];for(let i=0;i<maxTicks;i++){const before=new Map(this.brain.store.projectTasks(projectId).map(t=>[t.id,t.status]));const tick=await this.tick(projectId);for(const task of this.brain.store.projectTasks(projectId)){if(before.get(task.id)!==task.status&&(task.status==="completed"||task.status==="failed"||task.status==="blocked"))results.push({status:task.status==="completed"?"completed":task.status==="failed"?"failed":"blocked",summary:task.error??("Worker completed task: "+task.title),output:task.output})}if(!tick.claimed&&!tick.recovered)break;if(!this.hasRunnableWork(projectId))break}return results}
 async start(projectId:string,intervalMs=1000):Promise<void>{if(this.running)return;this.running=true;while(this.running){await this.tick(projectId);if(this.running)await new Promise(resolve=>setTimeout(resolve,Math.max(50,intervalMs)))}}
 stop(){this.running=false}
 claimedTasks():string[]{return[...this.claimed.keys()]}
 async wake(){for(const projectId of this.brain.store.projects.keys())await this.tick(projectId)}
 private hasRunnableWork(projectId:string){return this.brain.store.projectTasks(projectId).some(t=>t.status==="queued"&&(!t.lease||t.lease.expiresAt<=Date.now())&&t.dependencies.every(d=>this.brain.store.getTask(d)?.status==="completed"))}
 private emit(type:string,task:Task,data:Record<string,unknown>){const event:BrainEvent={id:id(),type,timestamp:now(),projectId:task.projectId,taskId:task.id,actor:"worker:"+this.workerId,data};this.brain.store.events.push(event)}
}
