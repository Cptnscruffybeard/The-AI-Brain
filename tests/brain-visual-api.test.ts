import {describe,expect,it} from "vitest";
import {AIBrain} from "../src/brain.js";
import {brainGraphResponse,brainSnapshotResponse} from "../src/visual/brain-api.js";

describe("brain visual API boundary",()=>{
  it("returns read-only JSON representations",()=>{
    const brain=new AIBrain();
    const project=brain.createProject("visual-test");
    brain.remember({projectId:project.id,type:"fact",content:"safe snapshot",tags:[],source:"test",confidence:1,importance:1});
    const snapshot=brainSnapshotResponse(brain);
    const graph=brainGraphResponse(brain);
    expect(snapshot.status).toBe(200);
    expect(graph.status).toBe(200);
    expect(JSON.parse(snapshot.body).memories).toHaveLength(1);
    expect(JSON.parse(graph.body).nodes.some((n:any)=>n.type==="memory")).toBe(true);
    expect(brain.store.memories.size).toBe(1);
  });
});
