import {describe,expect,it,vi} from "vitest";
import {PublicWebSearch} from "../src/research/web-search.js";
import {SearchBackedCrawler} from "../src/research/search-backed-crawler.js";

describe("public web search",()=>{
  it("parses search results and excludes URLs during verification",async()=>{
    const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(
      `<div class="result"><a class="result__a" href="https://a.example/x">A</a><a class="result__snippet">first result</a></div>
       <div class="result"><a class="result__a" href="https://b.example/x">B</a><a class="result__snippet">second result</a></div>`,
      {status:200,headers:{"content-type":"text/html"}}
    ));
    const search=new PublicWebSearch({endpoint:"https://search.test",timeoutMs:1000,maxResults:10,userAgent:"test"});
    const first=await search.search("test",2);
    expect(first.map(x=>x.url)).toEqual(["https://a.example/x","https://b.example/x"]);
    const second=await search.crossReference("test",["https://a.example/x"],2);
    expect(second.map(x=>x.url)).toEqual(["https://b.example/x"]);
    fetchMock.mockRestore();
  });

  it("uses search results as crawler seeds",async()=>{
    const search={search:vi.fn().mockResolvedValue([{id:"1",url:"https://example.com",title:"x",retrievedAt:new Date().toISOString(),content:"",contentHash:""}])};
    const crawler={crawl:vi.fn().mockResolvedValue([])};
    const provider=new SearchBackedCrawler({search:search as never,crawler:crawler as never});
    await provider.search("topic",3);
    expect(search.search).toHaveBeenCalledWith("topic",3);
    expect(crawler.crawl).toHaveBeenCalledWith(["https://example.com"],3);
  });
});
