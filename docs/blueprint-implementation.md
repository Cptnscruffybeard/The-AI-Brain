# Blueprint implementation map

This document maps the supplied AI Brain blueprint to the repository without silently replacing blueprint requirements with unrelated architecture.

| Blueprint area | Current implementation | Remaining work |
|---|---|---|
| Structured memory | `src/domain/types.ts`, `src/core/store.ts`, `AIBrain.remember()` | Durable storage, proposal/validation/conflict workflow, semantic retrieval |
| Context Compiler | `src/context/context-compiler.ts` | Vector/relationship retrieval, artifact extraction, model context budgets |
| Agents | `src/agents/registry.ts`, agent contract in domain types | Full specialist team and provider/model adapters |
| Structured task envelopes | Domain task model | Full envelope routing, retries, resumability |
| Orchestrator | `src/orchestration/orchestrator.ts` | Dependency scheduler, parallel execution, escalation and budgets |
| Task graph | Task dependencies are stored explicitly | Ready-task scheduler and dependency failure propagation |
| Policy / authority | `src/policy/policy-engine.ts` | Persistent policies, approvals and credential scopes |
| Tool Gateway | `src/tools/tool-gateway.ts` | Real integrations and scoped credentials |
| Audit/events | `BrainStore.events` and orchestrator/tool events | Durable event store, correlation IDs and telemetry |
| Kill switch | `PolicyEngine.stopAll()` | External control plane independent of runtime process |
| QA / Security / Red Team | Contracts and roadmap only | Implement specialist agents and mandatory release gates |
| Coding factory | Architecture documented | Implement research/spec/code/test/security/red-team/release workflow |
| Business operating system | Architecture documented | Add business-domain agents and approval policies |
| Self-improvement | Architecture rule documented | Versioned proposals, sandbox tests, baseline comparison and rollback |

## Authority model
L0 read-only analysis; L1 isolated workspace changes; L2 branch/commit/PR; L3 reviewed merge; L4 staging deployment; L5 production deployment; L6 financial, legal, destructive or other high-impact actions.

Critical-risk work is blocked by default. The owner kill switch is enforced outside the agent's decision-making path.