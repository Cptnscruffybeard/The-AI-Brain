-- Atomic task claiming contract for multi-worker Brain deployments.
-- PostgreSQL is the authority for the claim; the application worker owns the execution lease.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lease_until timestamptz;

CREATE INDEX IF NOT EXISTS tasks_claim_idx
  ON tasks(project_id, status, lease_until, updated_at);

-- Claim one ready task atomically.
-- The application must supply project_id, worker_id, and lease_until.
WITH candidate AS (
  SELECT t.id
  FROM tasks t
  WHERE t.project_id = $1
    AND t.status = 'queued'
    AND (t.lease_until IS NULL OR t.lease_until < now())
    AND NOT EXISTS (
      SELECT 1
      FROM tasks dependency
      WHERE dependency.id IN (SELECT jsonb_array_elements_text(t.dependencies))
        AND dependency.status <> 'completed'
    )
  ORDER BY t.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE tasks t
SET lease_owner = $2,
    lease_until = $3,
    status = 'running',
    updated_at = now()
FROM candidate
WHERE t.id = candidate.id
RETURNING t.*;

-- A worker should clear its lease after completion/failure in the same state update.
-- Stale running work can be reclaimed by setting status back to queued when lease_until < now().