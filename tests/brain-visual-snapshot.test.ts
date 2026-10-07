import {describe,expect,it} from "vitest";
import {BrainStore} from "../src/core/store.js";
import {createBrainVisualSnapshot} from "../src/visual/brain-snapshot.js";

describe("brain visual snapshot",()=>{
  it("exports observable state without changing the store",()=>{
    const store=new BrainStore();
    store.projects.set("p",{id:"p",name:"P",description:"",status:"active",createdAt:"t",updatedAt:"t"});
    store.memories.set("m",{id:"m",type:"fact",content:"x",tags:[],source:"test",confidence:1,importance:5,createdAt:"t"});
    const before=store.memories.size;
    const snapshot=createBrainVisualSnapshot(store);
    expect(snapshot.version).toBe(1);
    expect(snapshot.projects).toHaveLength(1);
    expect(snapshot.memories).toHaveLength(1);
    expect(snapshot.events).toHaveLength(0);
    expect(store.memories.size).toBe(before);
  });
});
