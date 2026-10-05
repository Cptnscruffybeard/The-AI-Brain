import type {AgentDefinition,AgentResult,AuthorityLevel,ContextPacket,ModelRequest,Permission} from "../domain/types.js";
import type {ModelRouter} from "../model/model-router.js";

export interface ModelBackedAgentOptions {
  id:string; name:string; description:string; capabilities:string[]; permissions:Permission[]; authority:AuthorityLevel;
  providerId:string; model:string; systemPrompt:string; router:ModelRouter;
}

export class ModelBackedAgent implements AgentDefinition {
  readonly id:string; readonly name:string; readonly description:string; readonly capabilities:string[]; readonly permissions:Permission[]; readonly authority:AuthorityLevel;

  constructor(private readonly options:ModelBackedAgentOptions){
    this.id=options.id;
    this.name=options.name;
    this.description=options.description;
    this.capabilities=options.capabilities;
    this.permissions=options.permissions;
    this.authority=options.authority;
  }

  canHandle(){return true}

  async execute(ctx:ContextPacket):Promise<AgentResult>{
    const request:ModelRequest={
      messages:[{role:"system",content:this.options.systemPrompt},{role:"user",content:buildPrompt(ctx)}],
      temperature:0.2,maxTokens:4000
    };
    const response=await this.options.router.complete(request,this.options.providerId,this.options.model);
    return {status:"completed",summary:response.text,output:{text:response.text,provider:response.provider,model:response.model,usage:response.usage}};
  }
}

function buildPrompt(ctx:ContextPacket){
  return [
    "TASK:",ctx.task.title,ctx.task.description,"",
    "ACCEPTANCE CRITERIA:",...ctx.task.acceptanceCriteria.map(x=>"- "+x),"",
    "RULES:",...ctx.rules.map(x=>"- "+x),"",
    "CONSTRAINTS:",...ctx.constraints.map(x=>"- "+x),"",
    "RELEVANT MEMORY:",...ctx.memories.map(x=>"- ["+x.type+"] "+x.content),"",
    "ACTIVE DECISIONS:",...ctx.decisions.map(x=>"- "+x.text+" | rationale: "+x.rationale),"",
    "AVAILABLE TOOLS:",...ctx.allowedTools.map(x=>"- "+x),"",
    "Return a concise result. Do not claim a tool was used unless you actually used it."
  ].join("\n");
}
