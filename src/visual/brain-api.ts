import type {AIBrain} from "../brain.js";
import {createBrainVisualGraph} from "./brain-graph.js";
export interface BrainApiResponse{status:number;headers:Record<string,string>;body:string}
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
export function brainSnapshotResponse(brain:AIBrain):BrainApiResponse{return{status:200,headers,body:JSON.stringify(brain.visualSnapshot())}}
export function brainGraphResponse(brain:AIBrain):BrainApiResponse{return{status:200,headers,body:JSON.stringify(createBrainVisualGraph(brain.visualSnapshot()))}}
