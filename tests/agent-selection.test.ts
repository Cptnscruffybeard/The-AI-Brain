import {describe,expect,it} from "vitest";
import {AIBrain} from "../src/brain.js";
import type {AgentDefinition,Permission} from "../src/domain/types.js";

function agent(id:string,authority:0|1|2|3|4|5|6,permissions:Permission[],capabilities:string[]):AgentDefinition{
  return {
    id,name:id,description:id,capabilities,permissions,authority,
    canHandle:()=>true,
    execute:async()=>({status:"completed",summary:id+" done"})
  };
}

describe("agent selection",()=>{
  it("selects the least-privileged agent that covers task permissions",async()=>{
    const b=new AIBrain();
    const p=b.createProject("select");
    b.registerAgent(agent("reader",0,["read"],["research"]));
    b.registerAgent(agent("writer",1,["read","write"],["coding"]));
    b.registerAgent(agent("executor",2,["read","write","execute"],["coding"]));

    const read=await b.request({projectId:p.id,goal:"read only work",permissions:["read"]});
    expect(read.status).toBe("completed");
    expect(read.summary).toContain("reader");

    const write=await b.request({projectId:p.id,goal:"write work",permissions:["read","write"]});
    expect(write.status).toBe("completed");
    expect(write.summary).toContain("writer");
  });

  it("blocks when no registered agent covers the permission envelope",async()=>{
    const b=new AIBrain();
    const p=b.createProject("gap");
    b.registerAgent(agent("reader",6,["read"],["research"]));
    const result=await b.request({projectId:p.id,goal:"needs write",permissions:["write"]});
    expect(result.status).toBe("blocked");
    expect(result.summary.toLowerCase()).toContain("no authorized agent");
  });

  it("prefers capability fit when authority is equal",async()=>{
    const b=new AIBrain();
    const p=b.createProject("fit");
    b.registerAgent(agent("generic",1,["read","write"],["planning"]));
    b.registerAgent(agent("coder",1,["read","write"],["coding","refactoring"]));
    const result=await b.request({projectId:p.id,goal:"implement and fix the bug in module",permissions:["read","write"]});
    expect(result.status).toBe("completed");
    expect(result.summary).toContain("coder");
  });
});
