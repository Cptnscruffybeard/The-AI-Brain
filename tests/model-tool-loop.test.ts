import {describe,it,expect} from "vitest";
import {AIBrain} from "../src/brain.js";
import {ModelBackedAgent} from "../src/agents/model-backed-agent.js";
import type {ModelProvider,ModelRequest} from "../src/domain/types.js";

describe("model tool loop",()=>{
  it("executes an allowed governed tool and feeds its result back to the model",async()=>{
    const b=new AIBrain();
    const p=b.createProject("tool-loop");
    let calls=0;
    const provider:ModelProvider={
      id:"fake-loop",
      models:()=>["test"],
      async complete(request:ModelRequest){
        calls++;
        if(calls===1){
          expect(request.messages.some(m=>m.role==="user")).toBe(true);
          return {provider:"fake-loop",model:"test",text:JSON.stringify({type:"tool_call",tool:"task.inspect",input:{taskId:[...b.store.tasks.values()][0]?.id}})};
        }
        const toolMessage=request.messages.find(m=>m.role==="tool");
        expect(toolMessage?.content).toContain("tool-loop");
        return {provider:"fake-loop",model:"test",text:JSON.stringify({type:"final",text:"tool result received"})};
      }
    };
    b.registerModelProvider(provider);
    b.registerStandardAgents("fake-loop","test");
    const result=await b.request({projectId:p.id,goal:"inspect the current task",acceptanceCriteria:["tool result received"]});
    expect(result.status).toBe("completed");
    expect(result.summary).toContain("tool result received");
    expect(calls).toBe(2);
    expect(b.store.events.map(e=>e.type)).toContain("tool.completed");
  });

  it("rejects a model request for a tool outside the governed set",async()=>{
    const b=new AIBrain();
    const p=b.createProject("tool-boundary");
    const provider:ModelProvider={
      id:"fake-boundary",
      models:()=>["test"],
      async complete(){
        return {provider:"fake-boundary",model:"test",text:JSON.stringify({type:"tool_call",tool:"not.allowed",input:{}})};
      }
    };
    b.registerModelProvider(provider);
    b.registerStandardAgents("fake-boundary","test");
    const result=await b.request({projectId:p.id,goal:"attempt an unauthorized tool",permissions:["read"]});
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("outside the governed tool set");
  });

  it("stops a runaway model tool loop at the hard round limit",async()=>{
    const b=new AIBrain();
    const p=b.createProject("tool-loop-limit");
    let calls=0;
    const provider:ModelProvider={
      id:"fake-runaway",
      models:()=>["test"],
      async complete(){
        calls++;
        const task=[...b.store.tasks.values()][0];
        return {provider:"fake-runaway",model:"test",text:JSON.stringify({type:"tool_call",tool:"task.inspect",input:{taskId:task?.id}})};
      }
    };
    b.registerModelProvider(provider);
    b.registerStandardAgents("fake-runaway","test");
    const result=await b.request({projectId:p.id,goal:"never finish"});
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("limit exhausted");
    expect(calls).toBe(8);
  });
});
