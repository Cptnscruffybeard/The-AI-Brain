import type {Memory} from "../domain/types.js";
import type {BrainStore} from "../core/store.js";

export interface EmbeddingProvider {
  id:string;
  dimensions:number;
  embed(text:string):Promise<number[]>;
}

export interface SemanticMemoryMatch {
  memory:Memory;
  similarity:number;
}

export interface SemanticMemorySearch {
  search(projectId:string,queryEmbedding:number[],limit?:number):Promise<SemanticMemoryMatch[]>;
  upsert(memory:Memory,embedding:number[]):Promise<void>;
}

export class HybridMemoryRetriever {
  constructor(private store:BrainStore,private semantic?:SemanticMemorySearch){}

  async retrieve(projectId:string,query:string,limit=12){
    const lexical=this.store.projectMemories(projectId).filter(m=>!m.supersededBy).map(memory=>{
      const words=new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
      const overlap=memory.tags.filter(t=>words.has(t.toLowerCase())).length;
      const textOverlap=memory.content.toLowerCase().split(/\W+/).filter(w=>words.has(w)).length;
      return {memory,score:overlap*5+textOverlap};
    });
    lexical.sort((a,b)=>b.score-a.score);
    return lexical.slice(0,limit).map(x=>x.memory);
  }

  async semanticRetrieve(projectId:string,queryEmbedding:number[],limit=12){
    if(!this.semantic)return[];
    return this.semantic.search(projectId,queryEmbedding,limit);
  }
}
