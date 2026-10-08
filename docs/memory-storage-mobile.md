# Memory Storage and Mobile Architecture

## Goal

Keep the complete Brain memory bank off the phone and off ordinary client machines. The mobile app is a client, not the database.

## Storage tiers

| Tier | Purpose | Client behavior |
| --- | --- | --- |
| PostgreSQL | Structured memories, provenance, confidence, importance, project ownership, supersession | Never download the entire table |
| pgvector | Semantic embeddings and similarity retrieval | Server-side search |
| Object storage | Photos, PDFs, reports, recordings, large artifacts | Client downloads only when needed |
| Mobile cache | Current conversation/task context and a small recent/relevant working set | Bounded size with eviction |

## Current implementation

The Brain now exposes:

- GET /api/memories?projectId=&q=&limit=&offset= for bounded remote retrieval.
- POST /api/memories for governed memory creation.
- PostgresPersistence.memoryBank as the durable PostgreSQL-backed memory bank.
- Database indexes for ranked memory retrieval.

The API deliberately caps a page at 100 memories. A future mobile client should normally request far fewer.

## Recommended deployment

For the first personal prototype, a hosted PostgreSQL service is the simplest durable memory bank. Supabase currently offers PostgreSQL, pgvector, storage, and generated APIs; its free tier lists 500 MB database size and 1 GB storage. citeturn0search2turn0search19

Neon is another strong PostgreSQL option. Its October 2026 update lists 1 GB of database storage per free project. citeturn0search0

For large files, Cloudflare R2 is attractive because current standard storage is $0.015/GB-month and Internet egress is free. citeturn0search1

## Recommended architecture for the personal mobile version

Mobile UI → authenticated Brain API → PostgreSQL/pgvector → object storage

The phone should hold:

- active conversation context;
- current task context;
- a small encrypted cache of frequently/recently used memories;
- temporary offline changes waiting to sync.

The phone should not hold:

- the complete memory bank;
- the full vector index;
- all historical research;
- large attachments unless explicitly cached.

## Privacy/security requirements

- Per-user authentication and authorization before production.
- Encrypt traffic in transit.
- Encrypt sensitive data at rest.
- Tenant/user isolation at the database layer.
- Never expose raw database credentials to the mobile app.
- Server-side retrieval must enforce the caller's memory scope.
- Every memory should retain provenance and confidence.
- Superseded memories remain traceable rather than silently disappearing.
- Offline cache should have a configurable maximum size and automatic eviction.
- Large files should use short-lived authorized download URLs rather than permanent public URLs.

## Next mobile milestones

1. Create the separate personal Brain client/repository.
2. Build a phone-first interface around chat + memory + tasks.
3. Connect it to the remote memory-bank API.
4. Add encrypted bounded cache and sync.
5. Add authentication.
6. Add voice and notifications after the core sync path is stable.

The personal client must remain separate from The-AI-Brain; this repository remains the generic governed Brain core.
