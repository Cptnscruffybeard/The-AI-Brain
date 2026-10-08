# The AI Brain

Provider-independent, policy-controlled AI operating system based on the AI Brain blueprint.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## What is implemented

- Structured runtime state for projects, goals, decisions, memories, artifacts, tasks, agents and audit events.
- Memory with provenance, confidence, importance, supersession, and **hybrid lexical + semantic retrieval** (in-memory or pgvector).
- Bounded context compilation so agents receive task-relevant memory instead of the entire knowledge base.
- Replaceable specialist agents with **permission-aware, capability-preferring selection** (least privilege).
- Standard specialist team: Orchestrator, Research, Architect, Developer, QA, Security, Red Team, DevOps.
- Dependency-aware task model, planner, and **first-class workflows** (`research→verify→promote→brief`, coding review).
- Policy engine (L0–L6), risk ceilings, global kill switch, human approval queue.
- Tool Gateway with core tools plus optional **research.topic / research.brief** and sandboxed **repo.read / repo.list / repo.diff / repo.status**.
- Model-backed agents with bounded tool loops; quality gate only on completed results.
- Authenticated HTTP control plane (approvals, drain, kill switch, caller ceilings).
- PostgreSQL schema + pgvector HNSW index hooks.
- Remote-first memory bank with paged mobile APIs so clients keep only a bounded working set.
- Memory-bank query indexes; large artifacts are referenced by URI instead of copied into client storage.

## Architecture

```
Goal → plan / workflow → task graph → specialist agent
     → context compiler → policy → tool gateway → result
     → review / approval → memory (lexical + semantic)
```

## Quick start

```bash
npm install
npm test
npm run build
npm run live-demo   # http://127.0.0.1:8787  key: demo-secret-key

export BRAIN_API_KEY=your-secret
export OPENAI_API_KEY=sk-...      # optional
export BRAIN_MODEL=gpt-4o-mini    # optional
npm run start:dev
```

## Vertical research workflow

```ts
const brain = new AIBrain();
brain.configurePublicWebResearch(); // or configureResearch(provider, verifier)
brain.configureSemanticMemory();    // bag-of-words + in-memory index

const project = brain.createProject("learn");

// Plan only (queued tasks with dependencies)
brain.planResearch(project.id, "Pacific Ocean");

// Or execute the full pipeline now
const result = await brain.runResearchWorkflow(project.id, "Pacific Ocean");
// result.brief.facts → verified knowledge promoted into memory
```

Agents can call the same path via the governed tool:

```json
{"type":"tool_call","tool":"research.topic","input":{"projectId":"...","topic":"Pacific Ocean"}}
```

## Semantic memory

```ts
brain.configureSemanticMemory();
// or with Postgres pgvector after applying db/vector.sql:
// brain.configureSemanticMemory({ pgClient });

await brain.memory.retrieveHybrid(projectId, "largest ocean", 12);
```

`memory.search` uses hybrid retrieval when configured; plain `retrieve()` stays lexical for sync callers.

## Sandboxed git tools

```ts
brain.configureGit({ root: "/path/to/repo", allowPrefixes: ["src"] });
// registers repo.read, repo.list, repo.diff, repo.status
// paths cannot escape root; no shell; write/push not exposed
```

## HTTP control plane

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + kill-switch |
| GET | `/api/state` | Runtime snapshot |
| GET | `/api/approvals` | List approvals |
| GET | `/api/memories` | Paged remote memory-bank search |
| POST | `/api/memories` | Add a memory to the remote bank |
| POST | `/api/projects` | Create project |
| POST | `/api/projects/goal` | Submit goal |
| POST | `/api/approvals/decide` | Approve/reject + resume |
| POST | `/api/worker/drain` | Drain ready tasks |
| POST | `/api/policy/stop` \| `/resume` | Kill switch |

## Design rules

1. Policy lives outside the model.
2. Least-privilege agent selection.
3. Critical risk requires human approval.
4. Quality gate applies only to completed work.
5. Research promotes only multi-domain verified claims.
6. Repo tools are read-only and path-jailed.

## Memory storage architecture

The Brain is designed as **remote-first**, not device-first. PostgreSQL is the durable source of truth for structured memories. A mobile client should request only the memories needed for the current task, using `/api/memories` with a bounded page size. It should keep a small encrypted working cache rather than the complete memory bank.

For larger files, images, reports, and other artifacts, store the bytes in object storage and keep only a URI/metadata record in the Brain. pgvector can hold embeddings alongside memories for semantic retrieval without requiring the phone to maintain the full index.

Recommended production tiers:
1. PostgreSQL: structured memories, provenance, permissions, metadata, and durable indexing.
2. pgvector: semantic memory embeddings and similarity search.
3. S3-compatible object storage: large files/artifacts; Brain stores references rather than copies.
4. Mobile client: bounded working-set cache only; no full-memory download.
