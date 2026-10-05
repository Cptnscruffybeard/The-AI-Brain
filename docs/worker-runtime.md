# Brain Worker Runtime

The worker is the execution loop between durable task state and the orchestration layer.

## Responsibilities

1. Discover queued tasks whose dependencies are complete.
2. Claim a bounded number of tasks with a worker lease.
3. Execute them through the existing policy, context, tool, and review gates.
4. Release the lease after execution.
5. Recover tasks whose in-memory lease expires by returning them to queued.
6. Emit recovery audit events.
7. Continue until the project has no runnable work or a configured tick limit is reached.

## Safety model

The worker does not bypass the orchestrator. Every claimed task still passes agent selection, authority checks, critical-risk approval gates, tool gating, and review.

maxConcurrent limits local parallelism. leaseMs prevents a permanently stuck worker claim from leaving a task running forever.

PostgreSQL LISTEN/NOTIFY can be used as a wake-up signal for a production worker, while task rows and Brain events remain the durable source of truth. PostgreSQL documents NOTIFY as an asynchronous signaling mechanism and recommends using database tables for additional durable information.

## Current boundary

The current worker lease is process-local. A future production persistence/claim adapter should atomically claim task rows in PostgreSQL so multiple worker processes cannot claim the same task concurrently. That adapter is intentionally separate from the orchestration policy layer.