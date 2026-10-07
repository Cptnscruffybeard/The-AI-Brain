import type {ModelProvider,ModelRequest,ModelResponse} from "../domain/types.js";
export interface OpenAICompatibleOptions{apiKey:string;baseUrl?:string;models:string[];timeoutMs?:number}
export class OpenAICompatibleProvider implements ModelProvider{
 readonly id="openai-compatible"; private readonly baseUrl:string; private readonly timeoutMs:number;
 constructor(private readonly options:OpenAICompatibleOptions){if(!options.apiKey)throw new Error("API key is required.");if(!options.models.length)throw new Error("At least one model is required.");this.baseUrl=(options.baseUrl??"https://api.openai.com/v1").replace(/\/$/,"");this.timeoutMs=Math.max(1000,options.timeoutMs??60000)}
 models(){return [...this.options.models]}
 async complete(request:ModelRequest,model:string):Promise<ModelResponse>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.timeoutMs);try{const response=await fetch(this.baseUrl+"/chat/completions",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+this.options.apiKey},body:JSON.stringify({model,messages:request.messages,temperature:request.temperature,max_tokens:request.maxTokens}),signal:controller.signal});
   if(!response.ok){const errorText=await boundedBody(response,10_000);throw new Error("Model provider HTTP "+response.status+": "+errorText)}
   const body=JSON.parse(await boundedBody(response,2_000_000)) as any;const text=body?.choices?.[0]?.message?.content;if(typeof text!=="string")throw new Error("Model provider returned no text.");return{text,provider:this.id,model,usage:{inputTokens:body.usage?.prompt_tokens,outputTokens:body.usage?.completion_tokens}}}finally{clearTimeout(timer)}}
}

async function boundedBody(response:Response,maxBytes:number){
 const length=response.headers.get("content-length");
 if(length&&Number(length)>maxBytes)throw new Error("Model provider response is too large.");
 const reader=response.body?.getReader();
 if(!reader){const text=await response.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw new Error("Model provider response is too large.");return text;}
 const decoder=new TextDecoder();let total=0;let text="";
 while(true){const part=await reader.read();if(part.done)break;total+=part.value.byteLength;if(total>maxBytes){await reader.cancel();throw new Error("Model provider response is too large.");}text+=decoder.decode(part.value,{stream:true});}
 return text+decoder.decode();
}