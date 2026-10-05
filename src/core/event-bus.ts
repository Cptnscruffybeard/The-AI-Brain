import type {BrainEvent} from "../domain/types.js";
import type {BrainStore} from "./store.js";
export type EventHandler=(event:BrainEvent)=>void|Promise<void>;
export class BrainEventBus {
  private handlers=new Map<string,Set<EventHandler>>();
  constructor(private store:BrainStore){}
  on(type:string,handler:EventHandler){
    const set=this.handlers.get(type)??new Set<EventHandler>();
    set.add(handler);this.handlers.set(type,set);return ()=>set.delete(handler);
  }
  async publish(event:BrainEvent){
    for(const handler of this.handlers.get(event.type)??[]) await handler(event);
    for(const handler of this.handlers.get("*")??[]) await handler(event);
  }
  async emit(event:BrainEvent){this.store.events.push(event);await this.publish(event);}
}