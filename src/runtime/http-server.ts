import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {timingSafeEqual} from "node:crypto";
import {AIBrain} from "../brain.js";
import type {Memory,Permission,RiskLevel} from "../domain/types.js";
import {OpenAICompatibleProvider} from "../model/openai-compatible-provider.js";
import type {PostgresPersistence} from "../persistence/postgres-persistence.js";

const MAX_BODY_BYTES=1_000_000;
const RATE_WINDOW_MS=60_000;
const RATE_LIMIT=120;
const DRAIN_RATE_LIMIT=20;
const DEFAULT_CALLER_PERMISSIONS:Permission[]=["read","write","execute"];

export interface BrainHttpOptions{
 brain?:AIBrain;
 host?:string;
 port?:number;
 persistence?:PostgresPersistence;
 apiKey?:string;
 callerPermissions?:Permission[];
 callerRiskCeiling?:RiskLevel;
 rateLimit?:number;
 drainRateLimit?:number;
}

interface RateState{windowStart:number;count:number;drainCount:number}

export function createBrainHttpServer(options:BrainHttpOptions={}){
 const brain=options.brain??createConfiguredBrain();
 const persistence=options.persistence;
 const host=options.host??"127.0.0.1";
 const apiKey=options.apiKey??process.env.BRAIN_API_KEY;
 const callerPermissions=options.callerPermissions??parsePermissionEnv(process.env.BRAIN_API_PERMISSIONS,DEFAULT_CALLER_PERMISSIONS);
 const callerRiskCeiling=options.callerRiskCeiling??validRisk(process.env.BRAIN_API_RISK_CEILING??"high");
 const rateLimit=options.rateLimit??Number(process.env.BRAIN_RATE_LIMIT??RATE_LIMIT);
 const drainRateLimit=options.drainRateLimit??Number(process.env.BRAIN_DRAIN_RATE_LIMIT??DRAIN_RATE_LIMIT);
 const loopback=isLoopback(host);
 if(!loopback&&!apiKey)throw new Error("BRAIN_API_KEY is required when the HTTP control plane is not loopback-only.");
 if(!Number.isInteger(rateLimit)||rateLimit<1||rateLimit>10000)throw new Error("Invalid BRAIN_RATE_LIMIT.");
 if(!Number.isInteger(drainRateLimit)||drainRateLimit<1||drainRateLimit>1000)throw new Error("Invalid BRAIN_DRAIN_RATE_LIMIT.");

 const rateStates=new Map<string,RateState>();
 const server=createServer(async(req,res)=>{
  setHeaders(res);
  try{
   if(req.method!=="GET"&&req.method!=="POST"){res.setHeader("allow","GET, POST");return send(res,405,{error:"method not allowed"})}
   const path=new URL(req.url??"/","http://127.0.0.1").pathname;
   if(!consumeRate(req,res,path,rateStates,rateLimit,drainRateLimit))return;
   if(!authorize(req,res,apiKey,callerPermissions))return;

   if(req.method==="GET"&&path==="/api/health"){
    return send(res,200,{ok:true,projects:brain.store.projects.size,tasks:brain.store.tasks.size,modelProviders:brain.models.list().map(x=>x.id),killSwitch:brain.policy.isStopped()});
   }
   if(req.method==="GET"&&path==="/api/state"){
    requirePermission(callerPermissions,"read");
    return send(res,200,brain.visualSnapshot());
   }
   if(req.method==="GET"&&path==="/api/memories"){
    requirePermission(callerPermissions,"read");
    if(!persistence)throw new Error("Memory bank is not configured on this server.");
    const url=new URL(req.url??"/","http://127.0.0.1");
    const projectId=url.searchParams.get("projectId")??undefined;
    const query=url.searchParams.get("q")??"";
    const limit=boundedInteger(Number(url.searchParams.get("limit")??20),"limit",1,100);
    const offset=boundedInteger(Number(url.searchParams.get("offset")??0),"offset",0,1_000_000);
    return send(res,200,await persistence.memoryBank.search(projectId,query,limit,offset));
   }
   if(req.method==="GET"&&path==="/api/approvals"){
    requirePermission(callerPermissions,"read");
    const url=new URL(req.url??"/","http://127.0.0.1");
    const projectId=url.searchParams.get("projectId")??undefined;
    const status=url.searchParams.get("status")??undefined;
    let rows=[...brain.store.approvals.values()];
    if(projectId)rows=rows.filter(a=>a.projectId===projectId);
    if(status==="pending"||status==="approved"||status==="rejected"||status==="expired")rows=rows.filter(a=>a.status===status);
    return send(res,200,{approvals:rows});
   }
   if(req.method==="POST"&&path==="/api/memories"){
    requirePermission(callerPermissions,"write");
    if(!persistence)throw new Error("Memory bank is not configured on this server.");
    const body=await jsonBody(req);
    const projectId=optionalBoundedString(body.projectId,"projectId",200);
    if(projectId&&!brain.store.getProject(projectId))return send(res,404,{error:"Project not found."});
    const type=body.type??"fact";
    const allowed=new Set(["preference","rule","decision","fact","lesson","assumption","constraint"]);
    if(typeof type!=="string"||!allowed.has(type))throw new Error("Invalid memory type.");
    const content=boundedString(body.content,"content",100_000);
    const confidence=typeof body.confidence==="number"?Math.max(0,Math.min(1,body.confidence)):0.7;
    const importance=typeof body.importance==="number"?Math.max(0,Math.min(1,body.importance)):0.5;
    const memory=brain.remember({
      ...(projectId?{projectId}:{}),type:type as Memory["type"],content,
      tags:Array.isArray(body.tags)?body.tags.map(String).slice(0,50):[],
      source:optionalBoundedString(body.source,"source",500)||"mobile",confidence,importance
    });
    await persistence.memoryBank.put(memory);
    return send(res,201,memory);
   }
   if(req.method==="POST"&&path==="/api/projects"){
    requirePermission(callerPermissions,"write");
    const body=await jsonBody(req);
    const name=boundedString(body.name,"name",1000);
    const description=optionalBoundedString(body.description,"description",100_000);
    const project=brain.createProject(name,description);
    if(persistence)await persistence.flush(brain.store);
    return send(res,201,project);
   }
   if(req.method==="POST"&&path==="/api/projects/goal"){
    requirePermission(callerPermissions,"write");
    const body=await jsonBody(req);
    const projectId=requiredString(body.projectId,"projectId");
    if(!brain.store.getProject(projectId))return send(res,404,{error:"Project not found."});
    const permissions=validPermissions(body.permissions??["read"]);
    const risk=validRisk(body.risk??"low");
    requireRisk(callerRiskCeiling,risk);
    requirePermissionSubset(permissions,callerPermissions);
    const acceptanceCriteria=Array.isArray(body.acceptanceCriteria)?body.acceptanceCriteria.map((x,i)=>boundedString(x,"acceptanceCriteria["+i+"]",10_000)):undefined;
    const request={projectId,goal:boundedString(body.goal,"goal",100_000),risk,permissions,...(acceptanceCriteria?{acceptanceCriteria}:{})};
    const result=await brain.request(request);
    if(persistence)await persistence.flush(brain.store);
    return send(res,200,result);
   }
   if(req.method==="POST"&&path==="/api/approvals/decide"){
    requirePermission(callerPermissions,"execute");
    const body=await jsonBody(req);
    const approvalId=requiredString(body.approvalId,"approvalId");
    const decision=body.decision;
    if(decision!=="approved"&&decision!=="rejected")throw new Error("decision must be approved or rejected.");
    const decidedBy=boundedString(body.decidedBy??"http-operator","decidedBy",200);
    const approval=brain.approvals.decide(approvalId,decision,decidedBy);
    let result:unknown=undefined;
    if(decision==="approved"){
      result=await brain.resumeApproved(approval.taskId,approval.id);
    }
    if(persistence)await persistence.flush(brain.store);
    return send(res,200,{approval,result});
   }
   if(req.method==="POST"&&path==="/api/worker/drain"){
    requirePermission(callerPermissions,"execute");
    const body=await jsonBody(req);
    const projectId=requiredString(body.projectId,"projectId");
    if(!brain.store.getProject(projectId))return send(res,404,{error:"Project not found."});
    const maxTicks=boundedInteger(body.maxTicks??100,"maxTicks",1,1000);
    const result=await brain.drain(projectId,maxTicks);
    if(persistence)await persistence.flush(brain.store);
    return send(res,200,result);
   }
   if(req.method==="POST"&&path==="/api/policy/stop"){
    requirePermission(callerPermissions,"execute");
    brain.stopAll();
    return send(res,200,{killSwitch:true});
   }
   if(req.method==="POST"&&path==="/api/policy/resume"){
    requirePermission(callerPermissions,"execute");
    brain.resume();
    return send(res,200,{killSwitch:false});
   }
   return send(res,404,{error:"not found"});
  }catch(error){
   const status=error instanceof AuthorizationError?error.status:400;
   return send(res,status,{error:error instanceof Error?error.message:"Request failed."});
  }
 });
 server.requestTimeout=30_000;
 server.headersTimeout=10_000;
 return {
  brain,server,
  listen:()=>new Promise<void>(resolve=>server.listen(options.port??Number(process.env.PORT||8787),host,()=>resolve()))
 };
}

function createConfiguredBrain(){
 const brain=new AIBrain();
 const key=process.env.OPENAI_API_KEY;
 const model=process.env.BRAIN_MODEL;
 if(key&&model){
  brain.registerModelProvider(new OpenAICompatibleProvider({
   apiKey:key,
   ...(process.env.OPENAI_BASE_URL?{baseUrl:process.env.OPENAI_BASE_URL}:{}),
   models:[model]
  }));
  brain.registerStandardAgents("openai-compatible",model);
 }
 return brain;
}

function setHeaders(res:ServerResponse){
 res.setHeader("content-type","application/json; charset=utf-8");
 res.setHeader("cache-control","no-store");
 res.setHeader("x-content-type-options","nosniff");
 res.setHeader("x-frame-options","DENY");
 res.setHeader("referrer-policy","no-referrer");
}

function send(res:ServerResponse,status:number,value:unknown){
 if(res.headersSent)return;
 res.writeHead(status);
 res.end(JSON.stringify(value));
}

function authorize(req:IncomingMessage,res:ServerResponse,apiKey:string|undefined,permissions:Permission[]){
 if(!apiKey)return true;
 const supplied=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):req.headers["x-api-key"];
 if(typeof supplied!=="string"||!safeEqual(supplied,apiKey)){
  res.setHeader("www-authenticate","Bearer");
  send(res,401,{error:"authentication required"});
  return false;
 }
 return true;
}

function safeEqual(a:string,b:string){
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
}

function consumeRate(req:IncomingMessage,res:ServerResponse,path:string,states:Map<string,RateState>,limit:number,drainLimit:number){
 const key=String(req.socket.remoteAddress??"unknown");
 const now=Date.now();
 let state=states.get(key);
 if(states.size>10_000){for(const [k,v] of states){if(now-v.windowStart>=RATE_WINDOW_MS)states.delete(k);if(states.size<=9_000)break}}
 if(!state||now-state.windowStart>=RATE_WINDOW_MS){state={windowStart:now,count:0,drainCount:0};states.set(key,state)}
 state.count++;
 if(path==="/api/worker/drain")state.drainCount++;
 const blocked=state.count>limit||state.drainCount>drainLimit;
 if(blocked){
  res.setHeader("retry-after",String(Math.ceil((state.windowStart+RATE_WINDOW_MS-now)/1000)));
  send(res,429,{error:"rate limit exceeded"});
  return false;
 }
 return true;
}

function requirePermission(available:readonly Permission[],needed:Permission){
 if(!available.includes(needed))throw new AuthorizationError(403,"caller lacks required permission: "+needed);
}
function requirePermissionSubset(requested:readonly Permission[],available:readonly Permission[]){
 const missing=requested.filter(x=>!available.includes(x));
 if(missing.length)throw new AuthorizationError(403,"requested permissions exceed caller ceiling: "+missing.join(", "));
}
function requireRisk(ceiling:RiskLevel,risk:RiskLevel){
 const rank:Record<RiskLevel,number>={low:0,medium:1,high:2,critical:3};
 if(rank[risk]>rank[ceiling])throw new AuthorizationError(403,"requested risk exceeds caller ceiling.");
}
function isLoopback(host:string){return host==="127.0.0.1"||host==="::1"||host==="localhost"}
function parsePermissionEnv(value:string|undefined,fallback:Permission[]){
 if(!value)return[...fallback];
 return validPermissions(value.split(",").map(x=>x.trim()).filter(Boolean));
}
function requiredString(value:unknown,name:string){
 if(typeof value!=="string"||!value.trim())throw new Error(name+" is required.");
 return value.trim();
}
function boundedString(value:unknown,name:string,max:number){
 const text=requiredString(value,name);
 if(text.length>max)throw new Error(name+" is too large.");
 return text;
}
function optionalBoundedString(value:unknown,name:string,max:number){
 if(value===undefined||value===null||value==="")return "";
 if(typeof value!=="string")throw new Error(name+" must be a string.");
 if(value.length>max)throw new Error(name+" is too large.");
 return value;
}
function boundedInteger(value:unknown,name:string,min:number,max:number){
 if(typeof value!=="number"||!Number.isInteger(value)||value<min||value>max)throw new Error(name+" must be an integer between "+min+" and "+max+".");
 return value;
}
function validRisk(value:unknown):RiskLevel{
 if(value==="low"||value==="medium"||value==="high"||value==="critical")return value;
 throw new Error("Invalid risk level.");
}
function validPermissions(value:unknown):Permission[]{
 const allowed=new Set<Permission>(["read","write","execute","deploy-staging","deploy-production","financial","legal","destructive","security-policy"]);
 if(!Array.isArray(value)||value.length>9||value.some(x=>typeof x!=="string"||!allowed.has(x as Permission)))throw new Error("Invalid permission.");
 return [...new Set(value as Permission[])];
}
async function jsonBody(req:IncomingMessage){
 const chunks:Buffer[]=[];
 for await(const chunk of req){
  chunks.push(typeof chunk==="string"?Buffer.from(chunk):Buffer.from(chunk));
  if(chunks.reduce((n,c)=>n+c.length,0)>MAX_BODY_BYTES)throw new Error("Request body too large.");
 }
 const data=Buffer.concat(chunks).toString("utf8");
 if(!data.trim())return {};
 const value=JSON.parse(data);
 if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("JSON object required.");
 return value as Record<string,unknown>;
}
class AuthorizationError extends Error{
 constructor(public readonly status:number,message:string){super(message)}
}
