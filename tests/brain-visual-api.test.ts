import {describe,expect,it} from "vitest";
import {AIBrain} from "../src/brain.js";
import {brainGraphResponse} from "../src/visual/brain-api.js";

describe("brain visual API boundary",()=>{
  it("returns only the sanitized graph",()=>{
    const brain=new AIBrain();const project=brain.createProject("visual-test");
    brain.remember({projectId:project.id,type:"fact",content:"safe",tags:[],source:"test",confidence:1,importance:1});
    const response=brainGraphResponse(brain),body=JSON.parse(response.body);
    expect(response.status).toBe(200);expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(body.nodes.some((n:{type:string})=>n.type==="memory")).toBe(true);
    expect(body.nodes.every((n:{id:string})=>n.id.includes(":"))).toBe(true);
    expect(brain.store.memories.size).toBe(1);
  });
  it("does not expose arbitrary event payloads",()=>{
    const brain=new AIBrain();const project=brain.createProject("event-test");
    brain.store.events.push({id:"same",type:"test",timestamp:"t",projectId:project.id,actor:"test",data:{secret:"DO_NOT_EXPOSE",memoryId:"missing"}});
    const body=JSON.parse(brainGraphResponse(brain).body);
    const event=body.nodes.find((n:{type:string})=>n.type==="event");
    expect(event.metadata.data).toBeUndefined();expect(JSON.stringify(body)).not.toContain("DO_NOT_EXPOSE");
  });
});
