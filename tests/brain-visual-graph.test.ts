import {describe,expect,it} from "vitest";
import {BrainStore} from "../src/core/store.js";
import {createBrainVisualSnapshot} from "../src/visual/brain-snapshot.js";
import {createBrainVisualGraph} from "../src/visual/brain-graph.js";
describe("brain visual graph",()=>{it("builds governed relationships without mutation",()=>{
 const store=new BrainStore(); store.projects.set("p",{id:"p",name:"P",description:"",status:"active",createdAt:"t",updatedAt:"t"});
 store.tasks.set("a",{id:"a",projectId:"p",title:"A",description:"",type:"work",status:"queued",dependencies:[],risk:"low",permissions:[],acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});
 store.tasks.set("b",{id:"b",projectId:"p",parentTaskId:"a",title:"B",description:"",type:"work",status:"queued",dependencies:["a"],risk:"low",permissions:[],acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});
 const graph=createBrainVisualGraph(createBrainVisualSnapshot(store));
 expect(graph.nodes).toHaveLength(3); expect(graph.edges.filter(e=>e.type==="dependency")).toHaveLength(1);
 expect(graph.edges.filter(e=>e.type==="parent")).toHaveLength(1); expect(graph.edges.filter(e=>e.type==="project")).toHaveLength(2);
 expect(store.tasks.get("b")?.dependencies).toEqual(["a"]);
});});
