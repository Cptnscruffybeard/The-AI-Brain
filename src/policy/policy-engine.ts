import type {AuthorityLevel,Permission,PolicyDecision,RiskLevel,Task,ToolRequest} from "../domain/types.js";
const rank:Record<RiskLevel,number>={low:0,medium:1,high:2,critical:3};
const level:Record<Permission,AuthorityLevel>={read:0,write:1,execute:1,"deploy-staging":4,"deploy-production":5,financial:6,legal:6,destructive:6,"security-policy":6};
const permissions=new Set(Object.keys(level));
const risks=new Set<RiskLevel>(["low","medium","high","critical"]);
const validPermissions=(values:unknown[]):values is Permission[]=>values.every(v=>typeof v==="string"&&permissions.has(v));

export class PolicyEngine {
  private stopped=false;
  stopAll(){this.stopped=true}
  resume(){this.stopped=false}
  isStopped(){return this.stopped}

  evaluateTask(t:Task,a:AuthorityLevel,approved=false):PolicyDecision{
    if(this.stopped)return{allowed:false,reason:"Global kill switch is active.",requiresApproval:true,authority:a};
    if(t.risk==="critical"&&!approved)return{allowed:false,reason:"Critical-risk work requires human approval.",requiresApproval:true,authority:a};
    const need=Math.max(0,...t.permissions.map(p=>level[p]));
    if(need>a)return{allowed:false,reason:"Task requires authority L"+need+"; agent has L"+a+".",requiresApproval:true,authority:a};
    return{allowed:true,reason:"Policy permits task execution.",requiresApproval:false,authority:a};
  }

  evaluateTool(r:ToolRequest,a:AuthorityLevel,toolRisk:RiskLevel):PolicyDecision{
    if(this.stopped)return{allowed:false,reason:"Global kill switch is active.",requiresApproval:true,authority:a};
    if(toolRisk==="critical")return{allowed:false,reason:"Critical-risk tools require human approval.",requiresApproval:true,authority:a};
    if(rank[toolRisk]>rank[r.risk])return{allowed:false,reason:"Tool risk exceeds task risk ceiling.",requiresApproval:true,authority:a};
    const missing=r.permissions.filter(p=>!r.taskPermissions.includes(p));
    if(missing.length)return{allowed:false,reason:"Tool permissions are outside the task permission envelope: "+missing.join(", ")+".",requiresApproval:false,authority:a};
    const need=Math.max(0,...r.permissions.map(p=>level[p]));
    if(need>a)return{allowed:false,reason:"Tool requires authority L"+need+"; agent has L"+a+".",requiresApproval:true,authority:a};
    return{allowed:true,reason:"Tool policy permits execution.",requiresApproval:false,authority:a};
  }
}
