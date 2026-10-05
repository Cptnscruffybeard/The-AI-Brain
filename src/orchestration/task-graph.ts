import type {Task,TaskStatus} from "../domain/types.js";
import type {BrainStore} from "../core/store.js";
export class TaskGraph {
 constructor(private store:BrainStore){}
 ready(projectId:string){return this.store.projectTasks(projectId).filter(t=>t.status==="queued"&&t.dependencies.every(d=>this.store.getTask(d)?.status==="completed"))}
 blocked(projectId:string){return this.store.projectTasks(projectId).filter(t=>t.status==="queued"&&t.dependencies.some(d=>["failed","cancelled","blocked"].includes(this.store.getTask(d)?.status??"blocked")))}
 dependents(taskId:string){return [...this.store.tasks.values()].filter(t=>t.dependencies.includes(taskId))}
 transition(taskId:string,status:TaskStatus){const task=this.store.getTask(taskId);if(!task)throw new Error("Unknown task: "+taskId);task.status=status;task.updatedAt=new Date().toISOString();return task}
}