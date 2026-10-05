import type {AgentDefinition,Task} from "../domain/types.js";
export class AgentRegistry { private agents=new Map<string,AgentDefinition>();
 register(a:AgentDefinition){if(this.agents.has(a.id))throw new Error("Agent already exists: "+a.id);this.agents.set(a.id,a)}
 get(id:string){return this.agents.get(id)} list(){return [...this.agents.values()]}
 select(t:Task){return this.list().filter(a=>a.authority>=required(t)&&a.canHandle(t)).sort((a,b)=>a.authority-b.authority)[0]}
}
function required(t:Task){if(t.permissions.includes("deploy-production"))return 5;if(t.permissions.some(p=>["financial","legal","destructive","security-policy"].includes(p)))return 6;if(t.permissions.includes("deploy-staging"))return 4;if(t.permissions.some(p=>["write","execute"].includes(p)))return 1;return 0}