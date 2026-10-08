import type {Id,Timestamp} from "../domain/types.js";

export interface ResearchSource { id:Id; url:string; title:string; retrievedAt:Timestamp; content:string; contentHash:string; }
export interface ResearchClaim { id:Id; topic:string; statement:string; sourceIds:Id[]; status:"unverified"|"verified"|"rejected"; confidence:number; createdAt:Timestamp; verifiedAt?:Timestamp; }
export interface UnverifiedResearch { id:Id; topic:string; query:string; sources:ResearchSource[]; claims:ResearchClaim[]; createdAt:Timestamp; }
export interface ResearchProvider { search(query:string,limit:number):Promise<ResearchSource[]>; }
export interface ResearchConfig { discoverySources:number; verificationSources:number; minIndependentSources:number; maxSourceChars:number; }
