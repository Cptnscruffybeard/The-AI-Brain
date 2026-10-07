import {createServer,type IncomingMessage,type ServerResponse} from "node:http";
import {AIBrain} from "../brain.js"; import type {Permission,RiskLevel} from "../domain/types.js"; import {OpenAICompatibleProvider} from "../model/openai-compatible-provider.js";
export interface BrainHttpOptions{brain?:AIBrain;host?:string;port?:number}
export function createBrainHttpServer(options:BrainHttpOptions={}){
 const brain=options.brain??createConfiguredBrain();
 const server=createServer(async(req,res)=>{setHeaders(res);try{
  if(req.method==="GET"&&req.url==="/api/health")return send(res,200,{ok:true,projects:brain.store.projects.size,tasks:brain.store.tasks.size});
  if(req.method==="GET"&&req.url==="/api/state")return send(res,200,brain.visualSnapshot());
  if(req.method==="POST"&&req.url==="/api/projects"){const body=await jsonBody(req);const name=requiredString(body.name,"name");return send(res,201,brain.createProject(name,String(body.description??"")))}
  if(req.method==="POST"&&req.url==="/api/projects/goal"){const body=await jsonBody(req);const projectId=requiredString(body.projectId,"projectId");if(!brain.store.getProject(projectId))return send(res,404,{error:"Project not found."});const result=await brain.request({projectId,goal:requiredString(body.goal,"goal"),risk:(body.risk??"low") as RiskLevel,permissions:Array.isArray(body.permissions)?body.permissions as Permission[]:["read"],acceptanceCriteria:Array.isArray(body.acceptanceCriteria)?body.acceptanceCriteria.map(String):undefined});return send(res,200,result)}
  if(req.method==="POST"&&req.url==="/api/worker/drain"){const body=await jsonBody(req);const projectId=requiredString(body.projectId,"projectId");return send(res,200,await brain.drain(projectId,Number(body.maxTicks??100)))}
  return send(res,404,{error:"not found"});
 }catch(error){return send(res,400,{error:error instanceof Error?error.message:"Request failed."})}});
 return {brain,server,listen:()=>new Promise<void>(resolve=>server.listen(options.port??Number(process.env.PORT||8787),options.host??"127.0.0.1",()=>resolve()))};
}
function createConfiguredBrain(){const brain=new AIBrain();const key=process.env.OPENAI_API_KEY;const model=process.env.BRAIN_MODEL;if(key&&model){brain.registerModelProvider(new OpenAICompatibleProvider({apiKey:key,baseUrl:process.env.OPENAI_BASE_URL,models:[model]}));brain.registerStandardAgents("openai-compatible",model)}return brain}
function setHeaders(res:ServerResponse){res.setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.setHeader("x-content-type-options","nosniff");res.setHeader("x-frame-options","DENY")}
function send(res:ServerResponse,status:number,value:unknown){res.writeHead(status);res.end(JSON.stringify(value))}
function requiredString(value:unknown,name:string){if(typeof value!=="string"||!value.trim())throw new Error(name+" is required.");return value.trim()}
async function jsonBody(req:IncomingMessage){let data="";for await(const chunk of req){data+=chunk;if(data.length>1_000_000)throw new Error("Request body too large.")}if(!data.trim())return {};const value=JSON.parse(data);if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("JSON object required.");return value as Record<string,unknown>}
