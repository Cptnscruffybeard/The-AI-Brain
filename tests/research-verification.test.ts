import {describe,expect,it} from "vitest";
import {BrainStore} from "../src/core/store.js";
import {ResearchEngine} from "../src/research/research-engine.js";
import type {ResearchProvider,ResearchSource,ResearchVerifier} from "../src/research/research-types.js";

const source=(id:string,domain:string,content:string):ResearchSource=>({
  id,url:"https://"+domain+"/fact",title:domain,retrievedAt:new Date().toISOString(),content,contentHash:id
});

const provider=(sources:ResearchSource[]):ResearchProvider=>({search:async()=>sources});
const verifier=(sources:ResearchSource[]):ResearchVerifier=>({crossReference:async(_q,excluded)=>{
  const blocked=new Set(excluded);
  return sources.filter(s=>!blocked.has(s.url));
}});

describe("research verification",()=>{
  it("requires three independent domains",async()=>{
    const text="The Pacific Ocean is the largest ocean on Earth by surface area.";
    const initial=[source("a","one.example",text),source("b","two.example",text)];
    const extra=[source("c","three.example",text)];
    const store=new BrainStore();
    const engine=new ResearchEngine(store,provider(initial),verifier(extra));
    const bank=await engine.research("p","oceans");
    const verified=await engine.verify("p",bank.id);
    expect(verified.claims.some(c=>c.status==="verified")).toBe(true);
    expect(verified.claims.find(c=>c.status==="verified")?.sourceIds.length).toBe(3);
  });

  it("does not treat multiple URLs on one domain as independent",async()=>{
    const text="The Pacific Ocean is the largest ocean on Earth by surface area.";
    const initial=[source("a","one.example",text),source("b","one.example/other",text)];
    const extra=[source("c","two.example",text)];
    const store=new BrainStore();
    const engine=new ResearchEngine(store,provider(initial),verifier(extra));
    const bank=await engine.research("p","oceans");
    const result=await engine.verify("p",bank.id);
    expect(result.claims.some(c=>c.status==="verified")).toBe(false);
  });
});
