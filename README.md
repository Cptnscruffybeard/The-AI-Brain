# The AI Brain

Provider-independent, policy-controlled AI operating system based on the AI Brain blueprint.

## What is implemented
- Structured runtime state for projects, goals, decisions, memories, artifacts, tasks, agents and audit events.
- Memory records with provenance, confidence, importance, recency and supersession.
- Bounded context compilation so agents receive task-relevant memory instead of the entire knowledge base.
- Replaceable specialist-agent contract with capabilities, permissions, authority and structured results.
- Standard specialist team: Orchestrator, Research, Architect, Developer, QA, Security, Red Team and DevOps.
- Dependency-aware task model with explicit dependencies, acceptance criteria, budgets and status.
- Policy engine with L0-L6 authority boundaries, risk ceilings and a global owner kill switch.
- Tool Gateway separating agent intent from tool execution and enforcing both agent permissions and the task permission envelope.
- Orchestrator that creates tasks, selects an authorized agent, compiles context, executes work and records audit events.
- Human approval queue for gated work and resumable approved tasks.
- Quality review gate between agent execution and task completion.
- Provider-independent model router and generic Responses API adapter.
- Dependency-aware planner with cycle validation.
- Bounded task scheduler for independent work, with drain-until-idle behavior.
- PostgreSQL schema under `db/schema.sql` and pgvector HNSW memory index under `db/vector.sql`.

## Architecture
Goal -> classify -> plan -> task graph -> specialist agent -> context compiler -> policy -> tool gateway -> result -> QA -> security -> red team -> approval -> deployment -> monitoring -> memory.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## Current status
The runtime foundation is substantially implemented, but production durability and real-world tool adapters are still separate deployment layers. The next major work is PostgreSQL-backed persistence, semantic memory retrieval, real Git/web/code/cloud tools, provider credentials, telemetry, and controlled self-improvement.

## Local development
npm install
npm test
npm run build
npm run demo
