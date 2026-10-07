import type {ModelProvider,ModelRequest,ModelResponse} from "../domain/types.js";

const MAX_MESSAGE_CHARS=200_000;
const MAX_RESPONSE_CHARS=1_000_000;

export class ModelRouter {
  private providers=new Map<string,ModelProvider>();

  register(provider:ModelProvider){
    if(!provider.id||!provider.models().length)throw new Error("Model provider must expose an id and at least one model.");
    if(this.providers.has(provider.id))throw new Error("Model provider already exists: "+provider.id);
    this.providers.set(provider.id,provider);
  }

  list(){return[...this.providers.values()]}

  async complete(request:ModelRequest,providerId:string,model:string):Promise<ModelResponse>{
    validateRequest(request);
    const provider=this.providers.get(providerId);
    if(!provider)throw new Error("Unknown model provider: "+providerId);
    if(!provider.models().includes(model))throw new Error("Model is not exposed by provider: "+model);
    const response=await provider.complete(request,model);
    validateResponse(response,providerId,model);
    return response;
  }
}

function validateRequest(request:ModelRequest){
  if(!request.messages.length)throw new Error("Model request requires at least one message.");
  for(const message of request.messages){
    if(!["system","user","assistant","tool"].includes(message.role))throw new Error("Invalid model message role.");
    if(typeof message.content!=="string"||message.content.length>MAX_MESSAGE_CHARS)throw new Error("Model message content is invalid or too large.");
  }
  if(request.temperature!==undefined&&(!Number.isFinite(request.temperature)||request.temperature<0||request.temperature>2))throw new Error("Model temperature must be between 0 and 2.");
  if(request.maxTokens!==undefined&&(!Number.isInteger(request.maxTokens)||request.maxTokens<1))throw new Error("Model maxTokens must be a positive integer.");
}

function validateResponse(response:ModelResponse,providerId:string,model:string){
  if(!response||typeof response.text!=="string"||response.text.length>MAX_RESPONSE_CHARS)throw new Error("Model provider returned an invalid or oversized response.");
  if(response.provider!==providerId||response.model!==model)throw new Error("Model provider returned mismatched identity.");
  if(response.usage){
    for(const value of Object.values(response.usage)){
      if(value!==undefined&&(!Number.isInteger(value)||value<0))throw new Error("Model provider returned invalid token usage.");
    }
  }
}
