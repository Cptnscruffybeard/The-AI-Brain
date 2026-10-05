# Persistence

The Brain currently runs against an in-memory store for deterministic local tests.

Production persistence is designed around PostgreSQL:
- `db/schema.sql` is the base relational schema.
- `db/vector.sql` enables pgvector and an HNSW cosine index for semantic memory retrieval.
- Events remain append-only at the application layer and can be persisted to `brain_events`.
- A future worker can use PostgreSQL transactions plus LISTEN/NOTIFY as a wake-up signal; the database remains the source of truth.

The vector dimension in `db/vector.sql` is 1536 and must be changed if the deployed embedding model uses a different dimension.
