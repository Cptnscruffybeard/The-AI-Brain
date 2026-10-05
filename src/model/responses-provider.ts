import type {ModelMessage,ModelProvider,ModelRequest,ModelResponse} from "../domain/types.js";

interface ResponsesProviderOptions {
  id?:string;
  baseUrl:string;
  apiKey:string;
  models:string[];
  headers?:Record<string,string>;
}

export class ResponsesApiProvider implements ModelProvider {
  readonly id:string;
  private readonly baseUrl:string;
  private readonly apiKey:string;
  private readonly availableModels:Set<string>;
  private readonly headers:Record<string,string>;

  constructor(options:ResponsesProviderOptions){
    this.id=options.id??"responses-api";
    this.baseUrl=options.baseUrl.replace(/\/$/,"");
    this.apiKey=options.apiKey;
    this.availableModels=new Set(options.models);
    this.headers={"content-type":"application/json",...options.headers};
  }

  models(){return [...this.availableModels]}

  async complete(request:ModelRequest,model:string):Promise<ModelResponse>{
    if(!this.availableModels.has(model)) throw new Error("Model is not exposed by provider: "+model);
    const response=await fetch(this.baseUrl+"/responses",{
      method:"POST",
      headers:{"authorization":"Bearer "+this.apiKey,...this.headers},
      body:JSON.stringify({
        model,
        input:request.messages.map(toInputItem),
        temperature:request.temperature,
        max_output_tokens:request.maxTokens
      })
    });
    if(!response.ok) throw new Error("Model provider returned HTTP "+response.status+": "+(await response.text()).slice(0,500));
    const body=await response.json() as {
      output_text?:string;
      output?:Array<{content?:Array<{type?:string,text?:string}>}>;
      usage?:{input_tokens?:number;output_tokens?:number}
    };
    const text=body.output_text??body.output?.flatMap(item=>item.content??[]).map(part=>part.text??"").join("")??"";
    if(!text) throw new Error("Model provider returned no text output.");
    return {text,provider:this.id,model,usage:{inputTokens:body.usage?.input_tokens,outputTokens:body.usage?.output_tokens}};
  }
}

function toInputItem(message:ModelMessage){
  return {role:message.role==="assistant"?"assistant":message.role==="tool"?"user":message.role,content:message.content};
}
