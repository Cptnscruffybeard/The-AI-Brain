import { randomUUID } from "node:crypto";
export const id=():string=>randomUUID();
export const now=():string=>new Date().toISOString();
