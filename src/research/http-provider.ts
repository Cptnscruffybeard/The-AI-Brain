import type {ResearchProvider,ResearchSource} from "./research-types.js";
import {id,now} from "../core/id.js";
import {sourceHash} from "./research-engine.js";

export class HttpResearchProvider implements ResearchProvider {
  constructor(private readonly endpoint:string,private readonly apiKey?:string){}
  async search(query:string,limit:number){
    const url=new URL(this.endpoint); url.searchParams.set("q",query); url.searchParams.set("limit",String(limit));
    const res=await fetch(url,{headers:this.apiKey?{authorization:"Bearer "+this.apiKey}:{}});
    if(!res.ok)throw new Error("Research provider failed: HTTP "+res.status);
    const data=await res.json() as {results?:Array<{url?:string;title?:string;content?:string}>};
    return (data.results??[]).filter(x=>x.url&&x.content).map(x=>{const content=String(x.content);return {id:id(),url:String(x.url),title:String(x.title??x.url),retrievedAt:now(),content,contentHash:sourceHash(content)} as ResearchSource;});
  }
}
