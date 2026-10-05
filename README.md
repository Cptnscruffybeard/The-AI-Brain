# The AI Brain

Provider-independent, policy-controlled AI operating system based on the AI Brain blueprint.

## What is implemented
- Persistent state boundary for projects, goals, decisions, memories, artifacts, tasks, agents and audit events.
- Memory records with type, provenance/source, confidence, importance, recency and supersession.
- Hybrid-style bounded context compilation so agents receive task-relevant memory instead of the entire knowledge base.
- Replaceable specialist-agent contract with capabilities, permissions, authority and structured results.
- Dependency-ready task model with explicit dependencies, acceptance criteria, budgets and status.
- Policy engine with L0-L6 authority boundaries, risk ceilings and a global owner kill switch.
- Tool Gateway separating agent intent from tool execution and applying policy before execution.
- Orchestrator that creates tasks, selects an authorized agent, compiles context, executes work and records audit events.
- Automated tests for successful work, insufficient authority, the kill switch, approvals and memory lifecycle.
- Human approval queue for gated work and resumable approved tasks.
- Quality review gate between agent execution and task completion.
- Provider-independent model router contract.
- Generic Responses API provider adapter and model-backed agent foundation.
- Dependency-aware task planner with cycle validation.
- Governed agent tool runtime: agents only receive tools permitted by their authority, permissions, and task risk.
- Production PostgreSQL schema under `db/schema.sql` for durable state migration.

## Architecture
Goal -> classify -> plan -> task graph -> specialist agent -> context compiler -> policy -> tool gateway -> result -> QA -> security -> red team -> approval -> deployment -> monitoring -> memory.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## Current status
This is now a stronger Phase 0-3 runtime foundation. It is still not the finished autonomous Brain: external model credentials, durable persistence wiring, real tools, specialist agents and controlled self-improvement remain.

Next engineering layers are durable PostgreSQL state, semantic/vector retrieval, relationship traversal, model/provider adapters, resumable task scheduling, approval queues, QA/security/red-team agents, scoped credentials, real Git/web/code/cloud tools, telemetry, and controlled learning.

## Local development
npm install
npm test
npm run build
npm run demo

See docs/architecture.md for the roadmap and docs/blueprint-implementation.md for the blueprint-to-code mapping.