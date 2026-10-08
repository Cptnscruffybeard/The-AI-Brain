import type {Memory} from "../domain/types.js";
import type {BrainStore} from "./store.js";
import type {SqlClient} from "../persistence/postgres-persistence.js";

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
  index?(memoryId:string,projectId:string|undefined,embedding:number[]):Promise<void>|void;
  search(projectId:string,embedding:number[],limit?:number):Promise<SemanticMemoryMatch[]>;
}

/** Deterministic bag-of-words embedding for local/tests without an API key. */
export class BagOfWordsEmbedding implements EmbeddingProvider {
  readonly id="bag-of-words";
  constructor(public readonly dimensions=256){}
  async embed(text:string){
    const vector=new Array<number>(this.dimensions).fill(0);
    const tokens=text.toLowerCase().split(/\W+/).filter(w=>w.length>=3);
    for(const token of tokens){
      let hash=2166136261;
      for(let i=0;i<token.length;i++)hash=Math.imul(hash^token.charCodeAt(i),16777619);
      const idx=Math.abs(hash)%this.dimensions;
      vector[idx]=(vector[idx]??0)+1;
    }
    return l2Normalize(vector);
  }
}

/** In-process cosine index used when Postgres/pgvector is not attached. */
export class InMemorySemanticIndex implements SemanticMemorySearch {
  private readonly vectors=new Map<string,{projectId?:string;embedding:number[]}>();
  constructor(private readonly store:BrainStore){}

  index(memoryId:string,projectId:string|undefined,embedding:number[]){
    this.vectors.set(memoryId,{...(projectId?{projectId}:{}),embedding});
  }

  remove(memoryId:string){this.vectors.delete(memoryId)}

  async search(projectId:string,embedding:number[],limit=12){
    const matches:SemanticMemoryMatch[]=[];
    for(const [memoryId,row] of this.vectors){
      if(row.projectId&&row.projectId!==projectId)continue;
      const memory=this.store.memories.get(memoryId);
      if(!memory||memory.supersededBy)continue;
      const similarity=cosine(embedding,row.embedding);
      if(similarity>0)matches.push({memory,similarity});
    }
    return matches.sort((a,b)=>b.similarity-a.similarity).slice(0,Math.max(1,limit));
  }
}

/** Postgres + pgvector cosine search (requires db/vector.sql). */
export class PgVectorSemanticSearch implements SemanticMemorySearch {
  constructor(private readonly client:SqlClient,private readonly store:BrainStore){}

  async index(memoryId:string,_projectId:string|undefined,embedding:number[]){
    const literal="["+embedding.join(",")+"]";
    await this.client.query("UPDATE memories SET embedding=$2::vector WHERE id=$1",[memoryId,literal]);
  }

  async search(projectId:string,embedding:number[],limit=12){
    const literal="["+embedding.join(",")+"]";
    const result=await this.client.query(
      `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
       FROM memories
       WHERE embedding IS NOT NULL
         AND superseded_by IS NULL
         AND (project_id = $2 OR project_id IS NULL)
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [literal,projectId,Math.max(1,limit)]
    );
    const matches:SemanticMemoryMatch[]=[];
    for(const row of result.rows){
      const memory=this.store.memories.get(String(row.id));
      if(!memory||memory.supersededBy)continue;
      matches.push({memory,similarity:Number(row.similarity??0)});
    }
    return matches;
  }
}

export class HybridMemoryRetriever {
  constructor(
    private readonly store:BrainStore,
    private readonly embedder?:EmbeddingProvider,
    private readonly semantic?:SemanticMemorySearch
  ){}

  async retrieve(projectId:string,query:string,limit=12){
    const lexical=this.lexical(projectId,query,limit);
    if(!this.embedder||!this.semantic)return lexical;

    const embedding=await this.embedder.embed(query);
    const semantic=await this.semantic.search(projectId,embedding,limit);
    const scores=new Map<string,{memory:Memory;score:number}>();

    lexical.forEach((memory,index)=>{
      scores.set(memory.id,{memory,score:(limit-index)*2});
    });
    for(const match of semantic){
      const current=scores.get(match.memory.id);
      const semanticScore=match.similarity*limit;
      if(current)current.score+=semanticScore;
      else scores.set(match.memory.id,{memory:match.memory,score:semanticScore});
    }
    return [...scores.values()].sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.memory);
  }

  async indexMemory(memory:Memory){
    if(!this.embedder||!this.semantic?.index)return;
    const embedding=await this.embedder.embed(memory.content+" "+memory.tags.join(" "));
    await this.semantic.index(memory.id,memory.projectId,embedding);
  }

  private lexical(projectId:string,query:string,limit:number){
    const words=new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
    return this.store.projectMemories(projectId).filter(m=>!m.supersededBy).map(memory=>{
      const tagHits=memory.tags.filter(t=>words.has(t.toLowerCase())).length;
      const textHits=memory.content.toLowerCase().split(/\W+/).filter(w=>words.has(w)).length;
      const age=Math.max(0,(Date.now()-Date.parse(memory.createdAt))/86400000);
      return {memory,score:tagHits*5+textHits*0.5+memory.importance*2+memory.confidence-age*0.01};
    }).sort((a,b)=>b.score-a.score).slice(0,limit).map(x=>x.memory);
  }
}

function cosine(a:number[],b:number[]){
  const n=Math.min(a.length,b.length);
  let dot=0,na=0,nb=0;
  for(let i=0;i<n;i++){
    const x=a[i]??0,y=b[i]??0;
    dot+=x*y;na+=x*x;nb+=y*y;
  }
  if(na===0||nb===0)return 0;
  return dot/(Math.sqrt(na)*Math.sqrt(nb));
}

function l2Normalize(vector:number[]){
  const norm=Math.sqrt(vector.reduce((s,v)=>s+v*v,0))||1;
  return vector.map(v=>v/norm);
}
