import {describe,expect,it} from "vitest";
import {BrainStore} from "../src/core/store.js";
import {createBrainVisualSnapshot} from "../src/visual/brain-snapshot.js";
import {createBrainVisualGraph} from "../src/visual/brain-graph.js";
describe("brain visual graph",()=>{
 it("builds governed relationships without mutation",()=>{
  const store=new BrainStore();store.projects.set("p",{id:"p",name:"P",description:"",status:"active",createdAt:"t",updatedAt:"t"});
  store.tasks.set("a",{id:"a",projectId:"p",title:"A",description:"",type:"work",status:"queued",dependencies:[],risk:"low",permissions:[],acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});
  store.tasks.set("b",{id:"b",projectId:"p",parentTaskId:"a",title:"B",description:"",type:"work",status:"queued",dependencies:["a"],risk:"low",permissions:[],acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});
  const graph=createBrainVisualGraph(createBrainVisualSnapshot(store));
  expect(graph.nodes).toHaveLength(3);expect(graph.edges.filter(e=>e.type==="dependency")).toHaveLength(1);expect(graph.edges.filter(e=>e.type==="parent")).toHaveLength(1);expect(graph.edges.filter(e=>e.type==="project")).toHaveLength(2);
  expect(graph.edges.find(e=>e.type==="dependency")).toMatchObject({source:"task:a",target:"task:b"});
  expect(store.tasks.get("b")?.dependencies).toEqual(["a"]);
  store.tasks.get("b")!.output={secret:"must not escape"};
  expect(graph.nodes.find(n=>n.id==="task:b")!.metadata).not.toHaveProperty("output");
 });
 it("keeps same raw IDs distinct across entity types",()=>{
  const store=new BrainStore();store.projects.set("p",{id:"p",name:"P",description:"",status:"active",createdAt:"t",updatedAt:"t"});
  store.tasks.set("same",{id:"same",projectId:"p",title:"T",description:"",type:"work",status:"queued",dependencies:[],risk:"low",permissions:[],acceptanceCriteria:[],attempts:0,createdAt:"t",updatedAt:"t"});
  store.events.push({id:"same",type:"event",timestamp:"t",projectId:"p",actor:"test",data:{}});
  const graph=createBrainVisualGraph(createBrainVisualSnapshot(store));const ids=graph.nodes.map(n=>n.id);
  expect(new Set(ids).size).toBe(ids.length);expect(ids).toEqual(expect.arrayContaining(["task:same","event:same"]));
 });
});
