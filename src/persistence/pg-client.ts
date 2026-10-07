import {Client} from "pg";
import type {SqlClient} from "./postgres-persistence.js";
export async function connectPostgres(url:string):Promise<{client:SqlClient;close:()=>Promise<void>}>{
 const client=new Client({connectionString:url});await client.connect();
 const sql:SqlClient={query:(text,values)=>client.query(text,values as any).then(r=>({rows:r.rows as Record<string,unknown>[]})),transaction:async work=>{await client.query("BEGIN");try{const result=await work(sql);await client.query("COMMIT");return result}catch(error){await client.query("ROLLBACK");throw error}}};
 return{client:sql,close:()=>client.end()};
}