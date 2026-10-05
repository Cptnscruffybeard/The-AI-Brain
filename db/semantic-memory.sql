-- Semantic memory operations for pgvector.
-- The application supplies an embedding with the same dimension as db/vector.sql.

CREATE OR REPLACE FUNCTION search_memories(
  p_project_id text,
  p_embedding vector(1536),
  p_limit integer DEFAULT 12
)
RETURNS TABLE(
  id text,
  content text,
  memory_type text,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.content,
    m.type AS memory_type,
    (1 - (m.embedding <=> p_embedding))::real AS similarity
  FROM memories m
  WHERE (m.project_id = p_project_id OR m.project_id IS NULL)
    AND m.superseded_by IS NULL
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> p_embedding
  LIMIT GREATEST(1, LEAST(p_limit, 100));
$$;
