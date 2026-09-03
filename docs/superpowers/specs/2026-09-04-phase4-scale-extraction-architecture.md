# Phase 4 — Scale-Extraction Architecture Note

**Status:** architectural note (no code change beyond this document)
**Date:** 2026-09-04
**Scope:** how the product-page → fact → knowledge extraction pipeline scales from
the current single-worker MVP to high-volume, multi-tenant ingestion.
**Blueprint refs:** §7 (ingestion), §9 (knowledge/RAG), §13 (jobs/queues), §19 (AI plane).

---

## 1. The pipeline today

Ingestion is already a queue-decoupled, port-driven pipeline. The control plane
(`apps/api`) only enqueues; the data plane (`apps/workers`) does the work.

```
registerSource (API)                         parse worker (BullMQ: ingestion queue)
──────────────────                           ──────────────────────────────────────
SourceDocument.create  ── enqueueParse ──►    ParseService.parseSource:
Asset.create (upload)                           1. safeFetchText(url)         ← SSRF-guarded fetch
                                                2. SourceParser.parse(text)   ← parser.port (stub/real)
                                                3. FactExtractor.extract(text)← extractor.port (stub → LLM)
                                                4. SourceFact.create[]        ← human-approval gate
                                                5. Knowledge.ingestChunks     ← chunk + EmbeddingPort → KnowledgeChunk
```

Key properties already in place that make scaling a tuning exercise rather than a
rewrite:

- **Ports, not SDKs.** `ParserPort`, `FactExtractorPort`, `EmbeddingPort`,
  `ModelGatewayPort` are all interfaces with swappable adapters. Scaling swaps a
  stub for a batched/remote adapter without touching callers.
- **Idempotent enqueue.** `JobsProducer` uses a deterministic `jobId`
  (`${orgId}:${sourceId}`) so BullMQ de-duplicates repeat submissions (§13).
- **Org-scoped rows.** Every record carries `orgId`, so sharding/partitioning by
  tenant is a data-layout decision, not a correctness one.
- **Fetch safety at connect time.** `guardedLookup` re-validates the resolved IP
  at socket-connect, closing the DNS-rebinding hole; size/time/redirect caps bound
  each fetch. These bounds are also the per-job resource budget the scheduler
  reasons about.

---

## 2. Scaling dimensions & targets

| Dimension | MVP | Target |
|---|---|---|
| Sources / hour | ~10s (1 worker) | 10k+ (autoscaled worker pool) |
| Extraction latency (p95) | seconds (stub) | < 30s incl. LLM extraction |
| Tenant isolation under load | logical (orgId) | logical + fair-share scheduling |
| Cost per source | ~0 (stub) | bounded + attributed per org |

---

## 3. Throughput: worker pool + queue topology

1. **Horizontal workers.** `apps/workers` is stateless; run N replicas consuming
   the `ingestion` queue. BullMQ concurrency (`worker.concurrency`) sets per-replica
   parallelism. Scale replicas on queue depth (KEDA / queue-length HPA).
2. **Split the queue by cost class.** Fetch+parse (I/O-bound, cheap) and
   fact-extraction+embedding (CPU/LLM-bound, expensive) have different scaling
   curves. Split `ParseService.parseSource` into two stages across two queues
   (`ingestion.fetch` → `ingestion.extract`) so each autoscales independently and a
   slow LLM never starves cheap fetches. The stage boundary is already a natural
   seam (steps 1–2 vs 3–5 above).
3. **Priority + fairness.** Use per-tenant BullMQ job priorities (or a
   weighted-round-robin group key on `orgId`) so one tenant bulk-importing 50k SKUs
   cannot monopolize the pool. Cap concurrent in-flight jobs per org.

---

## 4. Extraction cost: batching, tiering, caching

Fact extraction and embedding are the dominant cost. Three levers, all
implementable behind the existing ports:

- **Batch the model calls.** `EmbeddingPort.embed` should accept and return arrays;
  the real adapter batches chunks (e.g. 64/req) to amortize round-trips. Same for
  extraction where the provider supports batch.
- **Model tiering.** Route via `ModelGatewayPort`: a cheap/fast model does the
  first-pass structured extraction; escalate to a stronger model only for
  low-confidence or high-value pages. Confidence + page value are already
  expressible as extraction metadata.
- **Content-hash cache.** Key extraction + embeddings by a hash of the normalized
  source text. Re-parsing an unchanged page (re-crawl, re-import) is then a cache
  hit — no model spend. Store the hash on `SourceDocument`; short-circuit in
  `parseSource` before step 3.

---

## 5. Reliability & backpressure

- **Retries with backoff + DLQ.** BullMQ `attempts` + exponential backoff for
  transient fetch/model failures; a dead-letter queue for poison jobs, surfaced in
  the ops view rather than lost.
- **Circuit breaking on providers.** When the model/embedding provider degrades,
  trip a breaker and shed to the DLQ with a `retry_after` rather than hammering it
  — mirrors the agent runtime's existing fallback stance.
- **Backpressure to the API.** Reject/queue-defer new `registerSource` when queue
  depth exceeds a tenant's fair-share ceiling; return `202` with a position, never
  an unbounded accept.
- **Idempotent stages.** Each stage is safe to re-run (upserts keyed by
  `orgId`+`sourceId`+content-hash), so at-least-once delivery is correct.

---

## 6. Cost attribution & governance

- Emit a `UsageRecord` per extraction/embedding batch (tokens, model, bytes) tagged
  by `orgId`. This feeds the existing cost/budget module so extraction spend is
  visible and **budget-gated** — the same fail-closed budget check used elsewhere
  applies before an expensive escalation.
- Restricted-vertical copy discovered during extraction is flagged for the policy
  gate (§17) at generation time, not at publish time, shortening the human-review
  loop.

---

## 7. Data layer at scale

- **Partition hot tables** (`KnowledgeChunk`, `SourceFact`, `Event`) by `orgId`
  (or `orgId`+time) once row counts warrant it. Queries are already org-scoped so
  partition pruning is automatic.
- **Vector store.** `KnowledgeChunk` embeddings move from the primary DB to a
  dedicated vector index (pgvector partitioned by org, or an external store) behind
  the unchanged `KnowledgeService.retrieve` interface.
- **Cold storage.** Raw fetched HTML/asset bytes live in object storage
  (`StoragePort`), never in primary rows — only refs + hashes are hot.

---

## 8. What to build first (incremental, no big-bang)

1. Array-batching in `EmbeddingPort` + real adapter. *(highest cost win)*
2. Content-hash cache short-circuit in `parseSource`. *(eliminates re-work)*
3. Split fetch vs extract queues + per-org concurrency cap. *(fairness + independent scale)*
4. `UsageRecord` emission from extraction → budget gate. *(cost control)*
5. Retry/backoff/DLQ + provider circuit breaker. *(reliability)*
6. Partition hot tables + external vector index. *(only when row counts demand it)*

Each step is isolated behind an existing port or queue boundary and ships
independently — no step requires the next to be valuable.
