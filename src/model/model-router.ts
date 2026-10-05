import type {ModelProvider,ModelRequest,ModelResponse} from "../domain/types.js";

export class ModelRouter {
  private providers=new Map<string,ModelProvider>();
  register(provider:ModelProvider){
    if(this.providers.has(provider.id)) throw new Error("Model provider already exists: "+provider.id);
    this.providers.set(provider.id,provider);
  }
  list(){return [...this.providers.values()]}
  async complete(request:ModelRequest,providerId:string,model:string):Promise<ModelResponse>{
    const provider=this.providers.get(providerId);
    if(!provider) throw new Error("Unknown model provider: "+providerId);
    if(!provider.models().includes(model)) throw new Error("Model is not exposed by provider: "+model);
    return provider.complete(request,model);
  }
}
