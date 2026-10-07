import type {BrainStore} from "../core/store.js";

export interface BrainVisualSnapshot {
  version: 1;
  generatedAt: string;
  projects: unknown[];
  goals: unknown[];
  decisions: unknown[];
  memories: unknown[];
  artifacts: unknown[];
  tasks: unknown[];
  events: unknown[];
  approvals: unknown[];
}

export function createBrainVisualSnapshot(store: BrainStore): BrainVisualSnapshot {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    projects: [...store.projects.values()],
    goals: [...store.goals.values()],
    decisions: [...store.decisions.values()],
    memories: [...store.memories.values()],
    artifacts: [...store.artifacts.values()],
    tasks: [...store.tasks.values()],
    events: [...store.events],
    approvals: [...store.approvals.values()],
  };
}
