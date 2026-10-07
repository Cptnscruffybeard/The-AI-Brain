import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {AIBrain} from "../brain.js"; import type {Permission,RiskLevel} from "../domain/types.js"; import {OpenAICompatibleProvider} from "../model/openai-compatible-provider.js";
import type {PostgresPersistence} from "../persistence/postgres-persistence.js";
export interface BrainHttpOptions{brain?:AIBrain;host?:string;port?:number;persistence?:PostgresPersistence}
export function createBrainHttpServer(options:BrainHttpOptions={}){
 const brain=options.brain??createConfiguredBrain();
 const persistence=options.persistence;
 const server=createServer(async(req,res)=>{setHeaders(res);try{if(req.method!=="GET"&&req.method!=="POST"){res.setHeader("allow","GET, POST");return send(res,405,{error:"method not allowed"})}
  if(req.method==="GET"&&req.url==="/api/health")return send(res,200,{ok:true,projects:brain.store.projects.size,tasks:brain.store.tasks.size,modelProviders:brain.models.list().map(x=>x.id)});
  if(req.method==="GET"&&req.url==="/api/state")return send(res,200,brain.visualSnapshot());
  if(req.method==="POST"&&req.url==="/api/projects"){const body=await jsonBody(req);const name=requiredString(body.name,"name");const project=brain.createProject(name,boundedString(body.description??"","description",100_000));if(persistence)await persistence.flush(brain.store);return send(res,201,project)}
  if(req.method==="POST"&&req.url==="/api/projects/goal"){const body=await jsonBody(req);const projectId=requiredString(body.projectId,"projectId");if(!brain.store.getProject(projectId))return send(res,404,{error:"Project not found."});const request:{projectId:string;goal:string;risk:RiskLevel;permissions:Permission[];acceptanceCriteria?:string[]}={projectId,goal:boundedString(body.goal,"goal",100_000),risk:validRisk(body.risk??"low"),permissions:validPermissions(body.permissions??["read"]),...(Array.isArray(body.acceptanceCriteria)?{acceptanceCriteria:body.acceptanceCriteria.map(String)}:{})};const result=await brain.request(request);if(persistence)await persistence.flush(brain.store);return send(res,200,result)}
  if(req.method==="POST"&&req.url==="/api/worker/drain"){const body=await jsonBody(req);const projectId=requiredString(body.projectId,"projectId");const result=await brain.drain(projectId,Number(body.maxTicks??100));if(persistence)await persistence.flush(brain.store);return send(res,200,result)}
  return send(res,404,{error:"not found"});
 }catch(error){return send(res,400,{error:error instanceof Error?error.message:"Request failed."})}});
 return {brain,server,listen:()=>new Promise<void>(resolve=>server.listen(options.port??Number(process.env.PORT||8787),options.host??"127.0.0.1",()=>resolve()))};
}
function createConfiguredBrain(){const brain=new AIBrain();const key=process.env.OPENAI_API_KEY;const model=process.env.BRAIN_MODEL;if(key&&model){brain.registerModelProvider(new OpenAICompatibleProvider({apiKey:key,...(process.env.OPENAI_BASE_URL?{baseUrl:process.env.OPENAI_BASE_URL}:{}),models:[model]}));brain.registerStandardAgents("openai-compatible",model)}return brain}
function setHeaders(res:ServerResponse){res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.setHeader("x-content-type-options","nosniff");res.setHeader("x-frame-options","DENY");res.setHeader("referrer-policy","no-referrer")}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status);res.end(JSON.stringify(value))}
function requiredString(value:unknown,name:string){if(typeof value!=="string"||!value.trim())throw new Error(name+" is required.");return value.trim()}
function boundedString(value:unknown,name:string,max:number){const text=requiredString(value,name);if(text.length>max)throw new Error(name+" is too large.");return text}
function validRisk(value:unknown):RiskLevel{if(value==="low"||value==="medium"||value==="high"||value==="critical")return value;throw new Error("Invalid risk level.")}
function validPermissions(value:unknown):Permission[]{const allowed=new Set<Permission>(["read","write","execute","deploy-staging","deploy-production","financial","legal","destructive","security-policy"]);if(!Array.isArray(value)||value.some(x=>typeof x!=="string"||!allowed.has(x as Permission)))throw new Error("Invalid permission.");return [...new Set(value as Permission[])]}
async function jsonBody(req:IncomingMessage){let data="";for await(const chunk of req){data+=chunk;if(data.length>1_000_000)throw new Error("Request body too large.")}if(!data.trim())return {};const value=JSON.parse(data);if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("JSON object required.");return value as Record<string,unknown>}
