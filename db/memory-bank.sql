-- Remote-first memory bank.
-- The phone/computer is a client and keeps only a bounded working set.
-- PostgreSQL remains the durable source of truth for structured memories.

CREATE INDEX IF NOT EXISTS memories_project_importance_idx
  ON memories(project_id, importance DESC, confidence DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS memories_source_idx
  ON memories(source);

-- Large attachments/artifacts should live in object storage and be referenced
-- from artifacts.uri rather than copied into the mobile memory cache.
