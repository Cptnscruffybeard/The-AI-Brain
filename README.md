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
- PostgreSQL schema under `db/schema.sql`, pgvector HNSW memory index under `db/vector.sql`, and a transactional snapshot adapter under `src/persistence/postgres-persistence.ts`.

## Architecture
Goal -> classify -> plan -> task graph -> specialist agent -> context compiler -> policy -> tool gateway -> result -> QA -> security -> red team -> approval -> deployment -> monitoring -> memory.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## Runtime status
The core Brain is intended to remain provider-independent and generic. Personal, business, or other domain-specific layers belong in separate projects or adapters and are not part of this repository.

## Current status
The runtime is functionally usable for governed model-driven work: model-backed agents can execute bounded tool loops through the Tool Gateway, core task/project/memory tools are registered, PostgreSQL persistence is available, workers support leases and recovery, and the HTTP control plane is authenticated when exposed beyond loopback. Real external Git/web/cloud adapters, richer semantic retrieval, telemetry, and controlled self-improvement remain deployment-layer work.

## Local development
npm install
npm test
npm run build
npm run demo
