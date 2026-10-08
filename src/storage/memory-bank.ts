import type {Memory} from "../domain/types.js";

export interface MemoryPage {
  items:Memory[];
  total:number;
  limit:number;
  offset:number;
}

export interface MemoryBank {
  get(id:string):Promise<Memory|undefined>;
  put(memory:Memory):Promise<void>;
  search(projectId:string|undefined,query:string,limit:number,offset:number):Promise<MemoryPage>;
}
