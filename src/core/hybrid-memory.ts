import type {Memory} from "../domain/types.js";
import type {BrainStore} from "./store.js";

export interface EmbeddingProvider {
  id:string;
  dimensions:number;
  embed(text:string):Promise<number[]>;
}
export interface SemanticMemoryMatch { memory:Memory; similarity:number; }
export interface SemanticMemorySearch {
  search(projectId:string,embedding:number[],limit?:number):Promise<SemanticMemoryMatch[]>;
}
export class HybridMemoryRetriever {
  constructor(private store:BrainStore,private semantic?:SemanticMemorySearch){}
  async retrieve(projectId:string,query:string,limit=12){
    const words=new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
    const lexical=this.store.projectMemories(projectId).filter(m=>!m.supersededBy).map(memory=>{
      const tagHits=memory.tags.filter(t=>words.has(t.toLowerCase())).length;
      const textHits=memory.content.toLowerCase().split(/\W+/).filter(w=>words.has(w)).length;
      return {memory,score:tagHits*5+textHits+memory.importance*2+memory.confidence};
    }).sort((a,b)=>b.score-a.score).slice(0,limit);
    return lexical.map(x=>x.memory);
  }
  async semanticRetrieve(projectId:string,embedding:number[],limit=12){
    return this.semantic?.search(projectId,embedding,limit)??[];
  }
}