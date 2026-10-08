import {spawn} from "node:child_process";
import {promises as fs} from "node:fs";
import path from "node:path";
import type {ToolDefinition} from "../domain/types.js";
import type {ToolGateway} from "./tool-gateway.js";

const MAX_READ_BYTES=200_000;
const MAX_DIFF_CHARS=200_000;
const MAX_LIST_ENTRIES=500;

export interface GitAdapterOptions {
  /** Absolute or relative path to the repository root. All paths are jailed here. */
  root:string;
  /** Optional allowlist of relative path prefixes (posix). Empty = whole root. */
  allowPrefixes?:string[];
}

/**
 * Read-only git/filesystem adapter.
 * - Paths cannot escape the configured root.
 * - No shell; git is invoked with argv only.
 * - Write/push/commit are intentionally not exposed.
 */
export class SandboxedGitAdapter {
  readonly root:string;
  private readonly allowPrefixes:string[];

  constructor(options:GitAdapterOptions){
    this.root=path.resolve(options.root);
    this.allowPrefixes=(options.allowPrefixes??[]).map(normalizeRel);
  }

  resolveSafe(relativePath:string){
    const rel=normalizeRel(relativePath||".");
    if(rel.split("/").includes(".."))throw new Error("Path escapes sandbox.");
    if(this.allowPrefixes.length&&rel!=="."&&!this.allowPrefixes.some(p=>rel===p||rel.startsWith(p+"/"))){
      throw new Error("Path is outside the allowed repository prefixes.");
    }
    const full=path.resolve(this.root,rel);
    const rootWithSep=this.root.endsWith(path.sep)?this.root:this.root+path.sep;
    if(full!==this.root&&!full.startsWith(rootWithSep))throw new Error("Path escapes sandbox.");
    return {full,rel};
  }

  async read(relativePath:string){
    const {full,rel}=this.resolveSafe(relativePath);
    const stat=await fs.stat(full);
    if(!stat.isFile())throw new Error("Not a file: "+rel);
    if(stat.size>MAX_READ_BYTES)throw new Error("File exceeds read size limit.");
    const content=await fs.readFile(full,"utf8");
    return {path:rel,bytes:Buffer.byteLength(content,"utf8"),content};
  }

  async list(relativePath=".",maxDepth=3){
    const depth=Math.max(0,Math.min(8,maxDepth));
    const {full,rel}=this.resolveSafe(relativePath);
    const entries:Array<{path:string;type:"file"|"dir"}>=[];
    await walk(full,rel,0,depth,entries);
    return entries.slice(0,MAX_LIST_ENTRIES);
  }

  async diff(options:{staged?:boolean;path?:string}={}){
    const args=["diff","--no-color","--no-ext-diff"];
    if(options.staged)args.push("--cached");
    if(options.path){
      const {rel}=this.resolveSafe(options.path);
      args.push("--",rel);
    }
    const {stdout,stderr,code}=await runGit(this.root,args);
    if(code!==0&&!stdout)throw new Error(stderr||"git diff failed");
    const text=stdout.length>MAX_DIFF_CHARS?stdout.slice(0,MAX_DIFF_CHARS)+"\n...[truncated]":stdout;
    return {staged:Boolean(options.staged),path:options.path??".",diff:text};
  }

  async status(){
    const {stdout,stderr,code}=await runGit(this.root,["status","--porcelain","-b"]);
    if(code!==0)throw new Error(stderr||"git status failed");
    return {status:stdout};
  }
}

export function registerGitTools(tools:ToolGateway,adapter:SandboxedGitAdapter){
  const defs:ToolDefinition[]=[
    {
      name:"repo.read",
      description:"Read a file from the sandboxed repository root.",
      risk:"low",
      requiredPermissions:["read"],
      execute:async(input)=>{
        const rel=typeof input==="object"&&input&&"path" in input?String((input as {path:unknown}).path):"";
        if(!rel.trim())throw new Error("path is required");
        return adapter.read(rel);
      }
    },
    {
      name:"repo.list",
      description:"List files under a path in the sandboxed repository root.",
      risk:"low",
      requiredPermissions:["read"],
      execute:async(input)=>{
        const obj=input&&typeof input==="object"?input as Record<string,unknown>:{};
        const rel=typeof obj.path==="string"?obj.path:".";
        const maxDepth=typeof obj.maxDepth==="number"?obj.maxDepth:3;
        return adapter.list(rel,maxDepth);
      }
    },
    {
      name:"repo.diff",
      description:"Show a git diff for the sandboxed repository (read-only).",
      risk:"low",
      requiredPermissions:["read"],
      execute:async(input)=>{
        const obj=input&&typeof input==="object"?input as Record<string,unknown>:{};
        return adapter.diff({
          staged:obj.staged===true,
          ...(typeof obj.path==="string"?{path:obj.path}:{})
        });
      }
    },
    {
      name:"repo.status",
      description:"Show porcelain git status for the sandboxed repository.",
      risk:"low",
      requiredPermissions:["read"],
      execute:async()=>adapter.status()
    }
  ];
  for(const tool of defs)tools.register(tool);
  return defs.map(d=>d.name);
}

function normalizeRel(value:string){
  return value.replace(/\\/g,"/").replace(/^\.\//,"").replace(/\/+$/,"")||".";
}

async function walk(full:string,rel:string,depth:number,maxDepth:number,out:Array<{path:string;type:"file"|"dir"}>){
  if(out.length>=MAX_LIST_ENTRIES)return;
  const stat=await fs.stat(full);
  if(stat.isFile()){out.push({path:rel,type:"file"});return;}
  if(!stat.isDirectory())return;
  if(rel!==".")out.push({path:rel,type:"dir"});
  if(depth>=maxDepth)return;
  const names=await fs.readdir(full);
  for(const name of names){
    if(name===".git"||name==="node_modules")continue;
    const childRel=rel==="."?name:rel+"/"+name;
    await walk(path.join(full,name),childRel,depth+1,maxDepth,out);
    if(out.length>=MAX_LIST_ENTRIES)return;
  }
}

function runGit(cwd:string,args:string[]){
  return new Promise<{stdout:string;stderr:string;code:number}>((resolve,reject)=>{
    const child=spawn("git",args,{cwd,env:{...process.env,GIT_TERMINAL_PROMPT:"0"},stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    child.stdout.on("data",chunk=>{stdout+=String(chunk);if(stdout.length>MAX_DIFF_CHARS*2)child.kill("SIGTERM");});
    child.stderr.on("data",chunk=>{stderr+=String(chunk);});
    child.on("error",reject);
    child.on("close",code=>resolve({stdout,stderr,code:code??1}));
  });
}
