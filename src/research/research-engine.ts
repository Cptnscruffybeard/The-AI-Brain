import {createHash} from "node:crypto";
import {id,now} from "../core/id.js";
import type {BrainStore} from "../core/store.js";
import type {Memory} from "../domain/types.js";
import type {ResearchClaim,ResearchConfig,ResearchProvider,ResearchVerifier,ResearchSource,UnverifiedResearch} from "./research-types.js";

const DEFAULT_CONFIG:ResearchConfig={discoverySources:8,verificationSources:6,minIndependentSources:3,maxSourceChars:50000};

export class ResearchEngine {
  private readonly unverified=new Map<string,UnverifiedResearch>();
  constructor(private readonly store:BrainStore,private readonly provider:ResearchProvider,private readonly verifier:ResearchVerifier,private readonly config:ResearchConfig=DEFAULT_CONFIG){}
  async research(projectId:string,topic:string,query=topic){
    const sources=await this.provider.search(query,this.config.discoverySources);
    const bank:UnverifiedResearch={id:id(),topic,query,sources:sources.slice(0,this.config.discoverySources),claims:[],createdAt:now()};
    this.unverified.set(bank.id,bank); this.store.researchBank.set(bank.id,bank);
    this.store.events.push({id:id(),type:"research.unverified.created",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,sourceCount:bank.sources.length}});
    return bank;
  }
  async verify(projectId:string,researchId:string){
    const bank=this.unverified.get(researchId); if(!bank) throw new Error("Unknown research record.");
    const verification=await this.verifier.crossReference(bank.query,bank.sources.map(s=>s.url),this.config.verificationSources);
    const all=this.uniqueSources([...bank.sources,...verification]);
    bank.sources=all;
    const claims=this.extractClaims(bank);
    for(const claim of claims){
      const evidence=all.map(source=>this.evidenceFor(source,claim)).filter(x=>x.score>=0.45);
      const domainEvidence=new Map<string,{source:ResearchSource;score:number;excerpt:string}>();
      for(const item of evidence){
        const domain=this.domainOf(item.source.url);
        const current=domainEvidence.get(domain);
        if(!current||item.score>current.score)domainEvidence.set(domain,item);
      }
      const independent=[...domainEvidence.values()].filter(x=>x.score>=0.55);
      claim.sourceIds=independent.map(x=>x.source.id);
      claim.evidence=independent.map(x=>({sourceId:x.source.id,excerpt:x.excerpt,score:x.score}));
      const corroboration=independent.length>=this.config.minIndependentSources;
      const quality=Math.min(1,independent.reduce((sum,x)=>sum+x.score,0)/Math.max(1,independent.length));
      claim.confidence=corroboration?Math.min(0.99,0.55+0.45*quality):Math.min(0.54,independent.length/this.config.minIndependentSources*0.54);
      claim.status=corroboration?"verified":"unverified";
      if(claim.status==="verified") claim.verifiedAt=now();
    }
    bank.claims=claims;
    const verified=claims.filter(c=>c.status==="verified");
    for(const claim of verified){
      const memory:Omit<Memory,"id"|"createdAt">={projectId,type:"fact",content:claim.statement,tags:[bank.topic],source:"research:"+bank.id,confidence:claim.confidence,importance:0.5};
      const memoryId=id();
      this.store.memories.set(memoryId,{...memory,id:memoryId,createdAt:now()});
      this.store.events.push({id:id(),type:"research.knowledge.promoted",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,claimId:claim.id,sourceCount:claim.sourceIds.length}});
    }
    this.store.events.push({id:id(),type:"research.verified",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,verifiedClaims:verified.length,sourceCount:all.length}});
    return bank;
  }
  getUnverified(id:string){return this.unverified.get(id) ?? this.store.researchBank.get(id);}
  async researchAndLearn(projectId:string,topic:string,maxRelated=3,maxDepth=1){
    const learned:string[]=[]; const first=await this.research(projectId,topic); const verified=await this.verify(projectId,first.id);
    if(maxDepth<=0)return {records:[verified],learned};
    const terms=this.relatedTopics(verified).slice(0,maxRelated);
    for(const related of terms){const record=await this.research(projectId,related); learned.push(related); await this.verify(projectId,record.id);}
    return {records:[verified],learned};
  }
  private relatedTopics(bank:UnverifiedResearch){
    const stop=new Set(["about","after","before","could","would","there","their","which","these","those","where","when","what","that","with","from","into","using","more","than","also","this","have","been"]);
    const counts=new Map<string,number>();
    for(const claim of bank.claims.filter(c=>c.status==="verified")) for(const word of claim.statement.toLowerCase().split(/\\W+/)) if(word.length>=6&&!stop.has(word)) counts.set(word,(counts.get(word)??0)+1);
    return [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(x=>bank.topic+" "+x[0]);
  }
  private uniqueSources(sources:ResearchSource[]){const seen=new Set<string>();return sources.filter(s=>{const key=s.url.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});}
  private extractClaims(bank:UnverifiedResearch):ResearchClaim[]{
    const out:ResearchClaim[]=[]; const seen=new Set<string>();
    for(const source of bank.sources){
      const text=source.content.slice(0,this.config.maxSourceChars);
      for(const sentence of text.split(/(?<=[.!?])\s+/).filter(s=>s.length>=40).slice(0,30)){
        const statement=sentence.replace(/\s+/g," ").trim(); const key=statement.toLowerCase();
        if(seen.has(key))continue; seen.add(key);
        out.push({id:id(),topic:bank.topic,statement,sourceIds:[],status:"unverified",confidence:0,createdAt:now()});
      }
    }
    return out.slice(0,100);
  }
  private evidenceFor(source:ResearchSource,claim:ResearchClaim){
    const words=this.keywords(claim.statement);
    const sentences=source.content.split(/(?<=[.!?])\s+/).map(s=>s.trim()).filter(Boolean);
    let best={score:0,excerpt:""};
    for(const sentence of sentences.slice(0,200)){
      const sentenceWords=new Set(this.keywords(sentence));
      if(!sentenceWords.size)continue;
      const overlap=words.filter(w=>sentenceWords.has(w)).length/Math.max(1,words.length);
      const coverage=words.filter(w=>sentenceWords.has(w)).length/Math.max(1,sentenceWords.size);
      const score=0.65*overlap+0.35*coverage;
      if(score>best.score)best={score,excerpt:sentence.slice(0,1000)};
    }
    return {source,score:best.score,excerpt:best.excerpt};
  }

  private keywords(text:string){
    const stop=new Set(["about","after","again","against","before","being","between","could","does","doing","from","have","into","more","other","over","such","than","that","their","there","these","they","this","those","using","what","when","where","which","with","would","also","been","were","will"]);
    return [...new Set(text.toLowerCase().split(/\W+/).filter(w=>w.length>=5&&!stop.has(w)))];
  }

  private domainOf(url:string){
    try{return new URL(url).hostname.toLowerCase().replace(/^www\./,"");}catch{return url.toLowerCase();}
  }
}

export function sourceHash(content:string){return createHash("sha256").update(content).digest("hex");}
