import {id,now} from "../core/id.js";
import {sourceHash} from "./research-engine.js";
import type {ResearchProvider,ResearchVerifier,ResearchSource} from "./research-types.js";

export interface WebSearchConfig {
  endpoint:string;
  timeoutMs:number;
  maxResults:number;
  userAgent:string;
}

const DEFAULTS:WebSearchConfig={
  endpoint:"https://html.duckduckgo.com/html/",
  timeoutMs:10000,
  maxResults:10,
  userAgent:"AI-Brain-ResearchSearch/1.0"
};

/**
 * Public web search adapter. It uses a search-engine results page only to
 * discover URLs; page contents are fetched by the crawler. No credentials,
 * cookies, or private sessions are used.
 */
export class PublicWebSearch implements ResearchProvider,ResearchVerifier {
  constructor(private readonly config:WebSearchConfig=DEFAULTS){}

  async search(query:string,limit:number){
    return this.run(query,limit,[]);
  }

  async crossReference(query:string,excludeUrls:string[],limit:number){
    return this.run(query,limit,excludeUrls);
  }

  private async run(query:string,limit:number,excludeUrls:string[]){
    const requested=Math.max(1,Math.min(limit,this.config.maxResults));
    const excluded=new Set(excludeUrls.map(url=>this.canonicalUrl(url)));
    const body=new URLSearchParams({q:query});
    const response=await fetch(this.config.endpoint,{
      method:"POST",
      headers:{
        "content-type":"application/x-www-form-urlencoded",
        "user-agent":this.config.userAgent,
        "accept":"text/html"
      },
      body,
      redirect:"follow",
      signal:AbortSignal.timeout(this.config.timeoutMs)
    });
    if(!response.ok)throw new Error("Web search failed: HTTP "+response.status);
    const html=await response.text();
    const discovered=this.parseResults(html);
    const results:ResearchSource[]=[];
    const seen=new Set<string>();

    for(const result of discovered){
      const url=this.canonicalUrl(result.url);
      if(!url||excluded.has(url)||seen.has(url))continue;
      seen.add(url);
      results.push({
        id:id(),
        url,
        title:result.title,
        retrievedAt:now(),
        content:result.snippet,
        contentHash:sourceHash(result.snippet)
      });
      if(results.length>=requested)break;
    }
    return results;
  }

  private parseResults(html:string){
    const results:Array<{url:string;title:string;snippet:string}>=[];
    const blocks=html.split(/<div[^>]+class=["'][^"']*result[^"']*["'][^>]*>/i).slice(1);

    for(const block of blocks){
      const link=block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
        ?? block.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*result__a[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
      if(!link)continue;
      const url=this.decodeHtml(link[1]);
      if(!/^https?:\/\//i.test(url))continue;
      const title=this.clean(link[2]);
      const snippetMatch=block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
      const snippet=this.clean(snippetMatch?.[1]??"");
      results.push({url,title,snippet});
    }
    return results;
  }

  private clean(value:string){
    return this.decodeHtml(value.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim());
  }

  private decodeHtml(value:string){
    return value
      .replace(/&/gi,"&")
      .replace(/"/gi,'"')
      .replace(/&#x27;|&#39;/gi,"'")
      .replace(/</gi,"<")
      .replace(/>/gi,">")
      .replace(/&#x2F;|&#47;/gi,"/");
  }

  private canonicalUrl(value:string){
    try{
      const url=new URL(value);
      if(url.protocol!=="http:"&&url.protocol!=="https:")return "";
      url.hash="";
      return url.toString();
    }catch{return "";}
  }
}
