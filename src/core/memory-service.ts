import {id,now} from "./id.js";
import type {BrainStore} from "./store.js";
import type {Memory} from "../domain/types.js";

export class MemoryService {
  constructor(private store:BrainStore){}
  remember(input:Omit<Memory,"id"|"createdAt">){
    const memory={...input,id:id(),createdAt:now()};
    this.store.memories.set(memory.id,memory);
    this.store.events.push({id:id(),type:"memory.created",timestamp:now(),projectId:memory.projectId,actor:"memory-manager",data:{memoryId:memory.id}});
    return memory;
  }
  supersede(oldId:string,newMemory:Omit<Memory,"id"|"createdAt">){
    const old=this.store.memories.get(oldId);
    if(!old) throw new Error("Unknown memory: "+oldId);
    const next=this.remember(newMemory);
    old.supersededBy=next.id;
    this.store.events.push({id:id(),type:"memory.superseded",timestamp:now(),projectId:next.projectId,actor:"memory-manager",data:{oldId,newId:next.id}});
    return next;
  }
  retrieve(projectId:string,query:string,limit=12){
    const words=new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
    return this.store.projectMemories(projectId).filter(m=>!m.supersededBy).map(m=>{
      const overlap=m.tags.filter(t=>words.has(t.toLowerCase())).length;
      const textOverlap=m.content.toLowerCase().split(/\W+/).filter(w=>words.has(w)).length;
      const age=Math.max(0,(Date.now()-Date.parse(m.createdAt))/86400000);
      return {memory:m,score:overlap*5+textOverlap*0.5+m.importance*2+m.confidence-age*.01};
    }).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.memory);
  }
}
