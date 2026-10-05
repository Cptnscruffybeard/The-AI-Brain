-- Durable Brain storage schema.
-- PostgreSQL is the source-of-truth target for production persistence.
-- Vector retrieval can be enabled with pgvector when embeddings are introduced.

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  text text NOT NULL,
  risk text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id text PRIMARY KEY,
  project_id text REFERENCES projects(id),
  type text NOT NULL,
  content text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]',
  source text NOT NULL,
  confidence double precision NOT NULL,
  importance double precision NOT NULL,
  created_at timestamptz NOT NULL,
  superseded_by text REFERENCES memories(id)
);

CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  text text NOT NULL,
  rationale text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  uri text NOT NULL,
  kind text NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id),
  parent_task_id text REFERENCES tasks(id),
  title text NOT NULL,
  description text NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  dependencies jsonb NOT NULL DEFAULT '[]',
  assigned_agent text,
  risk text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '[]',
  acceptance_criteria jsonb NOT NULL DEFAULT '[]',
  budget jsonb,
  attempts integer NOT NULL DEFAULT 0,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id),
  project_id text NOT NULL REFERENCES projects(id),
  action text NOT NULL,
  reason text NOT NULL,
  risk text NOT NULL,
  status text NOT NULL,
  requested_by text NOT NULL,
  decided_by text,
  created_at timestamptz NOT NULL,
  decided_at timestamptz
);

CREATE TABLE IF NOT EXISTS brain_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  timestamp timestamptz NOT NULL,
  project_id text,
  task_id text,
  actor text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS memories_project_created_idx ON memories(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories(type);
CREATE INDEX IF NOT EXISTS tasks_project_status_idx ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS events_project_time_idx ON brain_events(project_id, timestamp DESC);
