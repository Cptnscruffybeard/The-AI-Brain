import type {BrainStore} from "../core/store.js";
import type {ApprovalRequest,Artifact,BrainEvent,Decision,Goal,Memory,Project,Task} from "../domain/types.js";

export interface SqlClient {
  query(text:string,values?:readonly unknown[]):Promise<{rows:Record<string,unknown>[]}>; 
  transaction<T>(work:(tx:SqlClient)=>Promise<T>):Promise<T>;
}

export class PostgresPersistence {
  constructor(private client:SqlClient){}

  async flush(store:BrainStore){
    return this.client.transaction(async tx=>{
      for(const row of store.projects.values()) await tx.query(PROJECT_UPSERT,projectValues(row));
      for(const row of store.goals.values()) await tx.query(GOAL_UPSERT,goalValues(row));
      for(const row of store.memories.values()) await tx.query(MEMORY_UPSERT,memoryValues(row));
      for(const row of store.decisions.values()) await tx.query(DECISION_UPSERT,decisionValues(row));
      for(const row of store.artifacts.values()) await tx.query(ARTIFACT_UPSERT,artifactValues(row));
      for(const row of store.tasks.values()) await tx.query(TASK_UPSERT,taskValues(row));
      for(const row of store.approvals.values()) await tx.query(APPROVAL_UPSERT,approvalValues(row));
      for(const row of store.events.values()) await tx.query(EVENT_INSERT,eventValues(row));
      return {projects:store.projects.size,goals:store.goals.size,memories:store.memories.size,decisions:store.decisions.size,artifacts:store.artifacts.size,tasks:store.tasks.size,approvals:store.approvals.size,events:store.events.length};
    });
  }

  async load(store:BrainStore){
    const [projects,goals,memories,decisions,artifacts,tasks,approvals,events]=await Promise.all([
      this.client.query(PROJECT_SELECT),this.client.query(GOAL_SELECT),this.client.query(MEMORY_SELECT),this.client.query(DECISION_SELECT),
      this.client.query(ARTIFACT_SELECT),this.client.query(TASK_SELECT),this.client.query(APPROVAL_SELECT),this.client.query(EVENT_SELECT)
    ]);
    store.projects.clear();store.goals.clear();store.memories.clear();store.decisions.clear();store.artifacts.clear();store.tasks.clear();store.approvals.clear();store.events.length=0;
    for(const row of projects.rows)store.projects.set(String(row.id),projectFromRow(row));
    for(const row of goals.rows)store.goals.set(String(row.id),goalFromRow(row));
    for(const row of memories.rows)store.memories.set(String(row.id),memoryFromRow(row));
    for(const row of decisions.rows)store.decisions.set(String(row.id),decisionFromRow(row));
    for(const row of artifacts.rows)store.artifacts.set(String(row.id),artifactFromRow(row));
    for(const row of tasks.rows)store.tasks.set(String(row.id),taskFromRow(row));
    for(const row of approvals.rows)store.approvals.set(String(row.id),approvalFromRow(row));
    store.events.push(...events.rows.map(eventFromRow));
    return {projects:store.projects.size,goals:store.goals.size,memories:store.memories.size,decisions:store.decisions.size,artifacts:store.artifacts.size,tasks:store.tasks.size,approvals:store.approvals.size,events:store.events.length};
  }
}

const PROJECT_UPSERT=`INSERT INTO projects(id,name,description,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at`;
const GOAL_UPSERT=`INSERT INTO goals(id,project_id,text,risk,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET project_id=EXCLUDED.project_id,text=EXCLUDED.text,risk=EXCLUDED.risk`;
const MEMORY_UPSERT=`INSERT INTO memories(id,project_id,type,content,tags,source,confidence,importance,created_at,superseded_by) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET project_id=EXCLUDED.project_id,type=EXCLUDED.type,content=EXCLUDED.content,tags=EXCLUDED.tags,source=EXCLUDED.source,confidence=EXCLUDED.confidence,importance=EXCLUDED.importance,superseded_by=EXCLUDED.superseded_by`;
const DECISION_UPSERT=`INSERT INTO decisions(id,project_id,text,rationale,status,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text,rationale=EXCLUDED.rationale,status=EXCLUDED.status`;
const ARTIFACT_UPSERT=`INSERT INTO artifacts(id,project_id,name,uri,kind) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,uri=EXCLUDED.uri,kind=EXCLUDED.kind`;
const TASK_UPSERT=`INSERT INTO tasks(id,project_id,parent_task_id,title,description,type,status,dependencies,assigned_agent,risk,permissions,acceptance_criteria,budget,attempts,output,error,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15::jsonb,$16,$17,$18) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,assigned_agent=EXCLUDED.assigned_agent,dependencies=EXCLUDED.dependencies,permissions=EXCLUDED.permissions,acceptance_criteria=EXCLUDED.acceptance_criteria,budget=EXCLUDED.budget,attempts=EXCLUDED.attempts,output=EXCLUDED.output,error=EXCLUDED.error,updated_at=EXCLUDED.updated_at`;
const APPROVAL_UPSERT=`INSERT INTO approvals(id,task_id,project_id,action,reason,risk,status,requested_by,decided_by,created_at,decided_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,decided_by=EXCLUDED.decided_by,decided_at=EXCLUDED.decided_at`;
const EVENT_INSERT=`INSERT INTO brain_events(id,type,timestamp,project_id,task_id,actor,data) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(id) DO NOTHING`;
const PROJECT_SELECT="SELECT * FROM projects ORDER BY created_at";
const GOAL_SELECT="SELECT * FROM goals ORDER BY created_at";
const MEMORY_SELECT="SELECT * FROM memories ORDER BY created_at";
const DECISION_SELECT="SELECT * FROM decisions ORDER BY created_at";
const ARTIFACT_SELECT="SELECT * FROM artifacts";
const TASK_SELECT="SELECT * FROM tasks ORDER BY created_at";
const APPROVAL_SELECT="SELECT * FROM approvals ORDER BY created_at";
const EVENT_SELECT="SELECT * FROM brain_events ORDER BY timestamp";

const json=(value:unknown)=>value===undefined?null:JSON.stringify(value);
const projectValues=(x:Project)=>[x.id,x.name,x.description,x.status,x.createdAt,x.updatedAt];
const goalValues=(x:Goal)=>[x.id,x.projectId,x.text,x.risk,x.createdAt];
const memoryValues=(x:Memory)=>[x.id,x.projectId??null,x.type,x.content,json(x.tags),x.source,x.confidence,x.importance,x.createdAt,x.supersededBy??null];
const decisionValues=(x:Decision)=>[x.id,x.projectId,x.text,x.rationale,x.status,x.createdAt];
const artifactValues=(x:Artifact)=>[x.id,x.projectId,x.name,x.uri,x.kind];
const taskValues=(x:Task)=>[x.id,x.projectId,x.parentTaskId??null,x.title,x.description,x.type,x.status,json(x.dependencies),x.assignedAgent??null,x.risk,json(x.permissions),json(x.acceptanceCriteria),json(x.budget),x.attempts,json(x.output),x.error??null,x.createdAt,x.updatedAt];
const approvalValues=(x:ApprovalRequest)=>[x.id,x.taskId,x.projectId,x.action,x.reason,x.risk,x.status,x.requestedBy,x.decidedBy??null,x.createdAt,x.decidedAt??null];
const eventValues=(x:BrainEvent)=>[x.id,x.type,x.timestamp,x.projectId??null,x.taskId??null,x.actor,json(x.data)];
const parsed=<T>(value:unknown,fallback:T):T=>typeof value==="string"?JSON.parse(value) as T:(value??fallback) as T;
const projectFromRow=(r:Record<string,unknown>):Project=>({id:String(r.id),name:String(r.name),description:String(r.description??""),status:r.status as Project["status"],createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
const goalFromRow=(r:Record<string,unknown>):Goal=>({id:String(r.id),projectId:String(r.project_id),text:String(r.text),risk:r.risk as Goal["risk"],createdAt:String(r.created_at)});
const memoryFromRow=(r:Record<string,unknown>):Memory=>({id:String(r.id),...(r.project_id===null||r.project_id===undefined?{}:{projectId:String(r.project_id)}),type:r.type as Memory["type"],content:String(r.content),tags:parsed<string[]>(r.tags,[]),source:String(r.source),confidence:Number(r.confidence),importance:Number(r.importance),createdAt:String(r.created_at),...(r.superseded_by===null||r.superseded_by===undefined?{}:{supersededBy:String(r.superseded_by)})});
const decisionFromRow=(r:Record<string,unknown>):Decision=>({id:String(r.id),projectId:String(r.project_id),text:String(r.text),rationale:String(r.rationale),status:r.status as Decision["status"],createdAt:String(r.created_at)});
const artifactFromRow=(r:Record<string,unknown>):Artifact=>({id:String(r.id),projectId:String(r.project_id),name:String(r.name),uri:String(r.uri),kind:r.kind as Artifact["kind"]});
const taskFromRow=(r:Record<string,unknown>):Task=>({id:String(r.id),projectId:String(r.project_id),...(r.parent_task_id===null||r.parent_task_id===undefined?{}:{parentTaskId:String(r.parent_task_id)}),title:String(r.title),description:String(r.description),type:String(r.type),status:r.status as Task["status"],dependencies:parsed<string[]>(r.dependencies,[]),...(r.assigned_agent===null||r.assigned_agent===undefined?{}:{assignedAgent:String(r.assigned_agent)}),risk:r.risk as Task["risk"],permissions:parsed<Task["permissions"]>(r.permissions,[]),acceptanceCriteria:parsed<string[]>(r.acceptance_criteria,[]),budget:parsed<Task["budget"]|undefined>(r.budget,undefined),attempts:Number(r.attempts),output:parsed<unknown|undefined>(r.output,undefined),...(r.error===null||r.error===undefined?{}:{error:String(r.error)}),createdAt:String(r.created_at),updatedAt:String(r.updated_at)});
const approvalFromRow=(r:Record<string,unknown>):ApprovalRequest=>({id:String(r.id),taskId:String(r.task_id),projectId:String(r.project_id),action:String(r.action),reason:String(r.reason),risk:r.risk as ApprovalRequest["risk"],status:r.status as ApprovalRequest["status"],requestedBy:String(r.requested_by),...(r.decided_by===null||r.decided_by===undefined?{}:{decidedBy:String(r.decided_by)}),createdAt:String(r.created_at),...(r.decided_at===null||r.decided_at===undefined?{}:{decidedAt:String(r.decided_at)})});
const eventFromRow=(r:Record<string,unknown>):BrainEvent=>({id:String(r.id),type:String(r.type),timestamp:String(r.timestamp),...(r.project_id===null||r.project_id===undefined?{}:{projectId:String(r.project_id)}),...(r.task_id===null||r.task_id===undefined?{}:{taskId:String(r.task_id)}),actor:String(r.actor),data:parsed<Record<string,unknown>>(r.data,{})});
