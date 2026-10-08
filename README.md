# The AI Brain

Provider-independent, policy-controlled AI operating system based on the AI Brain blueprint.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## What is implemented

- Structured runtime state for projects, goals, decisions, memories, artifacts, tasks, agents and audit events.
- Memory records with provenance, confidence, importance, recency and supersession.
- Bounded context compilation so agents receive task-relevant memory instead of the entire knowledge base.
- Replaceable specialist-agent contract with capabilities, permissions, authority and structured results.
- **Permission-aware agent selection** (covers task permissions, prefers capability fit, least privilege).
- Standard specialist team: Orchestrator, Research, Architect, Developer, QA, Security, Red Team and DevOps.
- Dependency-aware task model with explicit dependencies, acceptance criteria, budgets and status.
- Policy engine with L0–L6 authority boundaries, risk ceilings and a global owner kill switch.
- Tool Gateway separating agent intent from tool execution and enforcing both agent permissions and the task permission envelope.
- Orchestrator that creates tasks, selects an authorized agent, compiles context, executes work and records audit events.
- Human approval queue with HTTP list/decide endpoints and resumable approved tasks.
- Quality review gate between agent execution and task completion (preserves agent failure reasons).
- Provider-independent model router and OpenAI-compatible adapter.
- Governed research pipeline (search + crawl + verification + memory promotion).
- Dependency-aware planner with cycle validation and bounded task scheduler.
- PostgreSQL schema under `db/schema.sql`, pgvector HNSW memory index under `db/vector.sql`, and transactional snapshot adapter.
- Authenticated HTTP control plane (loopback-safe defaults, caller permission/risk ceilings, rate limits).

## Architecture

```
Goal → classify → plan → task graph → specialist agent
     → context compiler → policy → tool gateway → result
     → QA / security / approval → memory / deployment
```

## Quick start

```bash
npm install
npm test
npm run build

# Zero-dependency control-plane UI (auth + policy demo)
npm run live-demo
# open http://127.0.0.1:8787/  (API key: demo-secret-key)

# Full runtime (optional model)
export BRAIN_API_KEY=your-secret
export OPENAI_API_KEY=sk-...          # optional
export BRAIN_MODEL=gpt-4o-mini        # optional
npm run start:dev
```

## HTTP control plane (authenticated)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness + kill-switch flag |
| GET | `/api/state` | Visual/runtime snapshot |
| GET | `/api/approvals?status=pending` | List approvals |
| POST | `/api/projects` | Create project |
| POST | `/api/projects/goal` | Submit governed goal |
| POST | `/api/approvals/decide` | Approve/reject + resume |
| POST | `/api/worker/drain` | Drain ready tasks |
| POST | `/api/policy/stop` | Global kill switch on |
| POST | `/api/policy/resume` | Global kill switch off |

Non-loopback hosts require `BRAIN_API_KEY`. Caller permission and risk ceilings can be set via `BRAIN_API_PERMISSIONS` and `BRAIN_API_RISK_CEILING`.

## Design rules that matter

1. **Policy outside the model** — tools and tasks are gated by agent ∩ task permissions.
2. **Least privilege selection** — the lowest-authority agent that covers the task wins.
3. **Approvals for critical risk** — blocked until a human decides via API or code.
4. **Quality gate on completed work only** — real agent failures keep their original summaries.
5. **Research is governed** — discovery, verification, and memory promotion are separate steps.

## Current status

Usable for governed model-driven work: bounded tool loops, core task/project/memory tools, PostgreSQL persistence, worker leases, authenticated HTTP control plane, and a local live-demo harness.

Still open (deployment-layer): richer external adapters (Git/cloud), semantic retrieval beyond keyword memory, telemetry, and controlled self-improvement loops.
