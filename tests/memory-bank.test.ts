import {describe,expect,it} from "vitest";
import {PostgresMemoryBank} from "../src/storage/postgres-memory-bank.js";
import type {SqlClient} from "../src/persistence/postgres-persistence.js";
import type {Memory} from "../src/domain/types.js";

const memory:Memory={
  id:"m1",projectId:"p1",type:"fact",content:"The Pacific Ocean is the largest ocean.",tags:["ocean","pacific"],
  source:"research:r1",confidence:0.95,importance:0.7,createdAt:"2026-10-08T00:00:00.000Z"
};

describe("PostgresMemoryBank",()=>{
  it("reads a memory by id",async()=>{
    const client:SqlClient={query:async(text)=>({rows:text.includes("LIMIT 1")?[{
      id:memory.id,project_id:memory.projectId,type:memory.type,content:memory.content,
      tags:JSON.stringify(memory.tags),source:memory.source,confidence:memory.confidence,
      importance:memory.importance,created_at:memory.createdAt,superseded_by:null
    }]:[]}),transaction:async work=>work(client)};
    const bank=new PostgresMemoryBank(client);
    expect(await bank.get("m1")).toEqual(memory);
  });

  it("bounds page size and offset",async()=>{
    const calls:string[]=[];
    const client:SqlClient={query:async(text)=>{calls.push(text);return {rows:text.startsWith("SELECT count")?[{count:2}]:[]};},transaction:async work=>work(client)};
    const bank=new PostgresMemoryBank(client);
    const page=await bank.search("p1","ocean",999,-4);
    expect(page.limit).toBe(100);
    expect(page.offset).toBe(0);
    expect(page.total).toBe(2);
    expect(calls).toHaveLength(2);
  });
});
