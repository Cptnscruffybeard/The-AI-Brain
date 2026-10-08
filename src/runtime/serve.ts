import {createBrainHttpServer} from "./http-server.js";
import {PostgresPersistence} from "../persistence/postgres-persistence.js";
import {connectPostgres} from "../persistence/pg-client.js";
let closeDb=async()=>{};let persistence:PostgresPersistence|undefined;
if(process.env.DATABASE_URL){const db=await connectPostgres(process.env.DATABASE_URL);closeDb=db.close;persistence=new PostgresPersistence(db.client)}
const app=createBrainHttpServer(persistence?{persistence,host:process.env.BRAIN_HOST??"127.0.0.1"}:{host:process.env.BRAIN_HOST??"127.0.0.1"});
if(persistence)await app.brain.load(persistence)
await app.listen();
console.log("AI Brain listening on http://127.0.0.1:"+Number(process.env.PORT||8787));
const shutdown=async()=>{app.server.close();await closeDb();process.exit(0)};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);