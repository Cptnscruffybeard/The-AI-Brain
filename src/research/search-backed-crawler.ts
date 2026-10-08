import type {ResearchProvider,ResearchVerifier,ResearchSource} from "./research-types.js";
import {PublicWebCrawler} from "./web-crawler.js";
import {PublicWebSearch} from "./web-search.js";

export interface SearchBackedCrawlerConfig {
  search?:PublicWebSearch;
  crawler?:PublicWebCrawler;
}

export class SearchBackedCrawler implements ResearchProvider,ResearchVerifier {
  private readonly searcher:PublicWebSearch;
  private readonly crawler:PublicWebCrawler;

  constructor(config:SearchBackedCrawlerConfig={}){
    this.searcher=config.search??new PublicWebSearch();
    this.crawler=config.crawler??new PublicWebCrawler();
  }

  async search(query:string,limit:number):Promise<ResearchSource[]>{
    const discovered=await this.searcher.search(query,limit);
    return this.crawler.crawl(discovered.map(x=>x.url),limit);
  }

  async crossReference(query:string,excludeUrls:string[],limit:number):Promise<ResearchSource[]>{
    const discovered=await this.searcher.crossReference(query,excludeUrls,limit);
    return this.crawler.crawl(discovered.map(x=>x.url),limit);
  }
}
