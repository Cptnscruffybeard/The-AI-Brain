import type {Memory} from "../domain/types.js";
import type {SqlClient} from "../persistence/postgres-persistence.js";
import type {MemoryBank,MemoryPage} from "./memory-bank.js";

const json=(value:unknown)=>JSON.stringify(value);

export class PostgresMemoryBank implements MemoryBank {
  constructor(private readonly client:SqlClient){}

  async get(id:string){
    const result=await this.client.query(
      "SELECT * FROM memories WHERE id=$1 LIMIT 1",
      [id]
    );
    const row=result.rows[0];
    return row?memoryFromRow(row):undefined;
  }

  async put(memory:Memory){
    await this.client.query(
      `INSERT INTO memories(id,project_id,type,content,tags,source,confidence,importance,created_at,superseded_by)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET
         project_id=EXCLUDED.project_id,type=EXCLUDED.type,content=EXCLUDED.content,
         tags=EXCLUDED.tags,source=EXCLUDED.source,confidence=EXCLUDED.confidence,
         importance=EXCLUDED.importance,superseded_by=EXCLUDED.superseded_by`,
      [memory.id,memory.projectId??null,memory.type,memory.content,json(memory.tags),memory.source,memory.confidence,memory.importance,memory.createdAt,memory.supersededBy??null]
    );
  }

  async search(projectId:string|undefined,query:string,limit:number,offset:number):Promise<MemoryPage>{
    const safeLimit=Math.max(1,Math.min(100,Math.floor(limit)));
    const safeOffset=Math.max(0,Math.floor(offset));
    const words=query.toLowerCase().split(/\\W+/).filter(w=>w.length>=3).slice(0,20);
    const params:[unknown,unknown,unknown,unknown]=[projectId??null,safeLimit,safeOffset,words];
    const where=`WHERE ($1::text IS NULL OR project_id=$1 OR project_id IS NULL)
      AND superseded_by IS NULL
      AND (
        $4::text[] = '{}' OR
        content ILIKE ANY(SELECT '%'||w||'%' FROM unnest($4::text[]) AS w) OR
        EXISTS (SELECT 1 FROM jsonb_array_elements_text(tags) AS tag WHERE lower(tag)=ANY($4::text[]))
      )`;
    const rows=await this.client.query(
      `SELECT * FROM memories ${where}
       ORDER BY importance DESC, confidence DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      params
    );
    const total=await this.client.query(
      `SELECT count(*)::int AS count FROM memories ${where}`,
      params
    );
    return {
      items:rows.rows.map(memoryFromRow),
      total:Number(total.rows[0]?.count??0),
      limit:safeLimit,
      offset:safeOffset
    };
  }
}

const parsed=<T>(value:unknown,fallback:T):T=>typeof value==="string"?JSON.parse(value) as T:(value??fallback) as T;
const memoryFromRow=(r:Record<string,unknown>):Memory=>({
  id:String(r.id),
  ...(r.project_id===null||r.project_id===undefined?{}:{projectId:String(r.project_id)}),
  type:r.type as Memory["type"],
  content:String(r.content),
  tags:parsed<string[]>(r.tags,[]),
  source:String(r.source),
  confidence:Number(r.confidence),
  importance:Number(r.importance),
  createdAt:String(r.created_at),
  ...(r.superseded_by===null||r.superseded_by===undefined?{}:{supersededBy:String(r.superseded_by)})
});
