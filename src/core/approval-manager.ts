import {id,now} from "./id.js";
import type {ApprovalRequest,RiskLevel} from "../domain/types.js";
import type {BrainStore} from "./store.js";

export class ApprovalManager {
  constructor(private store:BrainStore){}
  request(taskId:string,projectId:string,action:string,reason:string,risk:RiskLevel,requestedBy:string){
    const approval:ApprovalRequest={id:id(),taskId,projectId,action,reason,risk,status:"pending",requestedBy,createdAt:now()};
    this.store.approvals.set(approval.id,approval);
    this.store.events.push({id:id(),type:"approval.requested",timestamp:now(),projectId,taskId,actor:requestedBy,data:{approvalId:approval.id,action,risk,reason}});
    return approval;
  }
  decide(approvalId:string,status:"approved"|"rejected",decidedBy:string){
    const approval=this.store.approvals.get(approvalId);
    if(!approval) throw new Error("Unknown approval: "+approvalId);
    if(approval.status!=="pending") throw new Error("Approval is already resolved.");
    approval.status=status; approval.decidedBy=decidedBy; approval.decidedAt=now();
    this.store.events.push({id:id(),type:"approval."+status,timestamp:now(),projectId:approval.projectId,taskId:approval.taskId,actor:decidedBy,data:{approvalId}});
    return approval;
  }
}
