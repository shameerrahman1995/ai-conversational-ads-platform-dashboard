# Phase 1 — Knowledge / RAG (P1.K) Implementation Plan

**Goal:** Chunk parsed source text, embed + index it, and serve org-scoped hybrid (semantic + keyword) retrieval with citations; index automatically after parsing.

**Architecture:** `KnowledgeModule` (global). `EmbeddingPort` with a deterministic `StubEmbedder` (hashed bag-of-tokens, L2-normalized) so retrieval is testable without a provider. `KnowledgeService.ingestChunks` writes `KnowledgeChunk` rows (vector stored in `metadata`); `retrieve` loads org-scoped chunks and ranks by `0.7*cosine + 0.3*keyword`. `ParseService` calls `ingestChunks` after fact extraction. Real embedder/vector-store swap in behind the port later.

**Spec:** `docs/superpowers/specs/2026-09-03-ai-conversational-ads-platform-design.md` (§16 AI agent & knowledge architecture)

## Tasks
- **T1** `vector-math.ts` (cosineSimilarity, keywordScore, tokenize) + tests.
- **T2** `chunking.ts` (chunkText by sentence up to a char budget) + tests.
- **T3** `embedding.port.ts` + `StubEmbedder` (deterministic, dim 32) + tests.
- **T4** `KnowledgeService` (ingestChunks / retrieve, org-scoped) + tests (isolation, ranking).
- **T5** `KnowledgeController` `POST /v1/knowledge/query` (creator) + DTO + module (global, exports service).
- **T6** Integrate: `ParseService` injects `KnowledgeService` and indexes chunks after parsing; wire `KnowledgeModule` in `app.module`.

## Acceptance
- Retrieval org-scoped (`findMany where orgId`); relevant chunk ranks first; citations (`sourceDocId`) returned.
- Deterministic embeddings; similar text → higher cosine than dissimilar.
- 12 unit tests; build/typecheck/test green; API boots; `/v1/knowledge/query` → 400 without `x-org-id`.

## Env note
No vector DB: vectors stored in `KnowledgeChunk.metadata` and scored in memory over org-scoped rows (fine for MVP). Swap to pgvector/managed index behind the port later.
