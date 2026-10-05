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
- Automated tests for successful work, insufficient authority and the kill switch.

## Architecture
Goal -> classify -> plan -> task graph -> specialist agent -> context compiler -> policy -> tool gateway -> result -> QA -> security -> red team -> approval -> deployment -> monitoring -> memory.

The model is never the final authority over permissions. External content is treated as data rather than authority. High-impact actions remain behind approval boundaries.

## Current status
This is the working Phase 0 foundation plus the first Phase 1-3 runtime pieces. It is not yet the finished autonomous Brain.

Next engineering layers are durable PostgreSQL state, semantic/vector retrieval, relationship traversal, model/provider adapters, resumable task scheduling, approval queues, QA/security/red-team agents, scoped credentials, real Git/web/code/cloud tools, telemetry, and controlled learning.

## Local development
npm install
npm test
npm run build
npm run demo

See docs/architecture.md for the roadmap and docs/blueprint-implementation.md for the blueprint-to-code mapping.