import {id,now} from "../core/id.js";
import {sourceHash} from "./research-engine.js";
import type {ResearchProvider,ResearchSource} from "./research-types.js";

export interface CrawlConfig { maxPages:number; maxDepth:number; perHostDelayMs:number; timeoutMs:number; maxCharsPerPage:number; userAgent:string; }

const DEFAULTS:CrawlConfig={maxPages:20,maxDepth:2,perHostDelayMs:750,timeoutMs:10000,maxCharsPerPage:50000,userAgent:"AI-Brain-ResearchCrawler/1.0"};

export class PublicWebCrawler implements ResearchProvider {
  constructor(private readonly config:CrawlConfig=DEFAULTS){}
  async search(query:string,limit:number){
    return this.crawl(this.seedUrls(query).slice(0,limit),limit);
  }

  async crawl(seedUrls:string[],limit=this.config.maxPages){
    const results:ResearchSource[]=[]; const queue=seedUrls.map(url=>({url,depth:0}));
    const visited=new Set<string>(); const hostLast=new Map<string,number>();
    while(queue.length&&results.length<this.config.maxPages){
      const item=queue.shift()!; const normalized=this.normalize(item.url);
      if(!normalized||visited.has(normalized)||item.depth>this.config.maxDepth)continue;
      visited.add(normalized);
      const url=new URL(normalized);
      const last=hostLast.get(url.host)??0; const wait=this.config.perHostDelayMs-(Date.now()-last);
      if(wait>0)await new Promise(r=>setTimeout(r,wait));
      hostLast.set(url.host,Date.now());
      if(!(await this.allowedByRobots(url)))continue;
      const page=await this.fetchPage(normalized); if(!page)continue;
      results.push(page);
      if(item.depth<this.config.maxDepth)for(const link of page.content.match(/https?:\/\/[^\s"'<>]+/g)??[])queue.push({url:link.replace(/[),.;]+$/,""),depth:item.depth+1});
    }
    return results.slice(0,limit);
  }
  private seedUrls(query:string){
    const terms=encodeURIComponent(query.trim());
    return [
      "https://en.wikipedia.org/wiki/"+terms.replace(/%20/g,"_"),
      "https://developer.mozilla.org/en-US/search?q="+terms,
      "https://www.rfc-editor.org/search/rfc_search_detail.php?title="+terms
    ];
  }
  private async allowedByRobots(url:URL){
    try{
      const res=await fetch(url.origin+"/robots.txt",{headers:{"user-agent":this.config.userAgent},signal:AbortSignal.timeout(this.config.timeoutMs)});
      if(!res.ok)return true;
      const lines=(await res.text()).split(/\r?\n/); let applies=false;
      for(const raw of lines){
        const line=(raw.split("#")[0]??"").trim(); const parts=line.split(":",2).map(x=>x.trim());
        const key=parts[0]; const value=parts[1];
        if(key?.toLowerCase()==="user-agent")applies=value==="*"||value===this.config.userAgent;
        if(applies&&key?.toLowerCase()==="disallow"&&value&&url.pathname.startsWith(value))return false;
      }
      return true;
    }catch{return true;}
  }
  private async fetchPage(url:string):Promise<ResearchSource|undefined>{
    try{
      const res=await fetch(url,{headers:{"user-agent":this.config.userAgent,"accept":"text/html,text/plain"},redirect:"follow",signal:AbortSignal.timeout(this.config.timeoutMs)});
      const type=res.headers.get("content-type")??""; if(!res.ok||!/^text\/(html|plain)|application\/json/i.test(type))return undefined;
      const raw=await res.text(); const content=this.extractText(raw).slice(0,this.config.maxCharsPerPage); if(content.length<80)return undefined;
      return {id:id(),url:res.url,title:this.title(raw,res.url),retrievedAt:now(),content,contentHash:sourceHash(content)};
    }catch{return undefined;}
  }
  private extractText(raw:string){
    const nbsp="&"+"nbsp;";
    const amp="&"+"amp;";
    return raw.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").split(nbsp).join(" ").split(amp).join("&").replace(/\s+/g," ").trim();
  }
  private title(raw:string,url:string){const m=raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);return (m?.[1]??url).replace(/\s+/g," ").trim().slice(0,300);}
  private normalize(url:string){try{const u=new URL(url);if(u.protocol!=="http:"&&u.protocol!=="https:")return undefined;u.hash="";return u.toString();}catch{return undefined;}}
}
