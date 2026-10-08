import type {AgentDefinition,Permission,Task} from "../domain/types.js";

export class AgentRegistry {
  private agents=new Map<string,AgentDefinition>();

  register(a:AgentDefinition){
    if(this.agents.has(a.id))throw new Error("Agent already exists: "+a.id);
    this.agents.set(a.id,a);
  }

  get(id:string){return this.agents.get(id)}
  list(){return [...this.agents.values()]}

  /**
   * Select the least-privileged agent that can cover the task:
   * 1. authority meets the permission-derived floor
   * 2. agent permission set covers every task permission
   * 3. canHandle accepts the task
   * Prefer capability keyword fit, then lower authority.
   */
  select(t:Task){
    const candidates=this.list()
      .filter(a=>a.authority>=requiredAuthority(t))
      .filter(a=>coversPermissions(a.permissions,t.permissions))
      .filter(a=>a.canHandle(t));
    return candidates.sort((a,b)=>{
      const scoreDiff=capabilityScore(b,t)-capabilityScore(a,t);
      if(scoreDiff!==0)return scoreDiff;
      return a.authority-b.authority;
    })[0];
  }
}

function coversPermissions(agent:readonly Permission[],needed:readonly Permission[]){
  return needed.every(p=>agent.includes(p));
}

function requiredAuthority(t:Task){
  if(t.permissions.includes("deploy-production"))return 5;
  if(t.permissions.some(p=>["financial","legal","destructive","security-policy"].includes(p)))return 6;
  if(t.permissions.includes("deploy-staging"))return 4;
  if(t.permissions.some(p=>["write","execute"].includes(p)))return 1;
  return 0;
}

function capabilityScore(agent:AgentDefinition,task:Task){
  const hay=(task.type+" "+task.title+" "+task.description).toLowerCase();
  let score=0;
  for(const capability of agent.capabilities){
    const token=capability.toLowerCase();
    if(!token)continue;
    if(hay.includes(token))score+=2;
    // soft matches for common specialist domains
    if(token.includes("research")&&/research|investigate|find|look up|search/.test(hay))score+=1;
    if(token.includes("coding")&&/code|implement|fix|refactor|bug/.test(hay))score+=1;
    if(token.includes("security")&&/security|threat|vulnerab|auth|permission/.test(hay))score+=1;
    if(token.includes("test")&&/test|qa|regress|verify/.test(hay))score+=1;
    if(token.includes("deploy")&&/deploy|release|ops|ci/.test(hay))score+=1;
  }
  return score;
}
