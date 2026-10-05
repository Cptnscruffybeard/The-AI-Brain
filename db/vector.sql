-- Enable with the pgvector extension.
-- Change 1536 to match the deployed embedding model dimension.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS memories_embedding_hnsw_idx
  ON memories USING hnsw (embedding vector_cosine_ops);

-- Example semantic retrieval:
-- SELECT id, content, 1 - (embedding <=> $1::vector) AS similarity
-- FROM memories
-- WHERE project_id = $2 OR project_id IS NULL
-- ORDER BY embedding <=> $1::vector
-- LIMIT $3;
