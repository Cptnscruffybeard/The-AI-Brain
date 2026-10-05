export class ReviewEngine {
  private rules:Array<(ctx:any,result:any)=>any>=[];
  register(rule:(ctx:any,result:any)=>any){this.rules.push(rule)}
  evaluate(ctx:any,result:any){
    const findings=this.rules.map(r=>r(ctx,result)).filter(Boolean);
    const critical=findings.filter((f:any)=>f.severity==="critical").length;
    const errors=findings.filter((f:any)=>f.severity==="error").length;
    const warnings=findings.filter((f:any)=>f.severity==="warning").length;
    const score=Math.max(0,100-critical*50-errors*25-warnings*5);
    return {passed:result.status==="completed"&&critical===0&&errors===0,score,findings};
  }
}
