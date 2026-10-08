import {createHash} from "node:crypto";
import {id,now} from "../core/id.js";
import type {BrainStore} from "../core/store.js";
import type {Memory} from "../domain/types.js";
import type {ResearchClaim,ResearchConfig,ResearchProvider,ResearchSource,UnverifiedResearch} from "./research-types.js";

const DEFAULT_CONFIG:ResearchConfig={discoverySources:8,verificationSources:6,minIndependentSources:3,maxSourceChars:50000};

export class ResearchEngine {
  private readonly unverified=new Map<string,UnverifiedResearch>();
  constructor(private readonly store:BrainStore,private readonly provider:ResearchProvider,private readonly config:ResearchConfig=DEFAULT_CONFIG){}
  async research(projectId:string,topic:string,query=topic){
    const sources=await this.provider.search(query,this.config.discoverySources);
    const bank:UnverifiedResearch={id:id(),topic,query,sources:sources.slice(0,this.config.discoverySources),claims:[],createdAt:now()};
    this.unverified.set(bank.id,bank);
    this.store.events.push({id:id(),type:"research.unverified.created",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,sourceCount:bank.sources.length}});
    return bank;
  }
  async verify(projectId:string,researchId:string){
    const bank=this.unverified.get(researchId); if(!bank) throw new Error("Unknown research record.");
    const verification=await this.provider.search(bank.query,this.config.verificationSources);
    const all=this.uniqueSources([...bank.sources,...verification]);
    bank.sources=all;
    const claims=this.extractClaims(bank);
    for(const claim of claims){
      const matches=all.filter(s=>this.supports(s,claim));
      claim.sourceIds=matches.map(s=>s.id);
      claim.confidence=Math.min(0.99,matches.length/this.config.minIndependentSources);
      claim.status=matches.length>=this.config.minIndependentSources?"verified":"unverified";
      if(claim.status==="verified") claim.verifiedAt=now();
    }
    bank.claims=claims;
    const verified=claims.filter(c=>c.status==="verified");
    for(const claim of verified){
      const memory:Omit<Memory,"id"|"createdAt">={projectId,type:"fact",content:claim.statement,tags:[bank.topic],source:"research:"+bank.id,confidence:claim.confidence,importance:0.5};
      this.store.memories.set(id(),{...memory,id:id(),createdAt:now()});
      this.store.events.push({id:id(),type:"research.knowledge.promoted",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,claimId:claim.id,sourceCount:claim.sourceIds.length}});
    }
    this.store.events.push({id:id(),type:"research.verified",timestamp:now(),projectId,actor:"research-engine",data:{researchId:bank.id,verifiedClaims:verified.length,sourceCount:all.length}});
    return bank;
  }
  getUnverified(id:string){return this.unverified.get(id);}
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
  private supports(source:ResearchSource,claim:ResearchClaim){
    const words=claim.statement.toLowerCase().split(/\W+/).filter(w=>w.length>4);
    const text=source.content.toLowerCase();
    const hits=words.filter(w=>text.includes(w)).length;
    return hits>=Math.max(3,Math.ceil(words.length*.35));
  }
}

export function sourceHash(content:string){return createHash("sha256").update(content).digest("hex");}
