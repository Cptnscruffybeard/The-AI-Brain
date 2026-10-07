import {createBrainHttpServer} from "./http-server.js";
import {PostgresPersistence} from "../persistence/postgres-persistence.js";
import {connectPostgres} from "../persistence/pg-client.js";
const app=createBrainHttpServer();
let closeDb=async()=>{};
if(process.env.DATABASE_URL){const db=await connectPostgres(process.env.DATABASE_URL);closeDb=db.close;await app.brain.load(new PostgresPersistence(db.client))}
await app.listen();
console.log("AI Brain listening on http://127.0.0.1:"+Number(process.env.PORT||8787));
const shutdown=async()=>{app.server.close();await closeDb();process.exit(0)};
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);