# Moderate RAG Improvements — Step-by-Step Guide

Scope note: these are the "next tier up" from the basic pipeline you already have working (parse → chunk → embed → store → retrieve). Deliberately **not** included here: query rewriting, multi-query retrieval, async ingestion (BullMQ/Redis), streaming, full observability platforms — those are Phase 3/6 territory, genuinely advanced/infra-heavy, and belong in a separate guide once this one is done.

```
Before (what you have):
query → embed → vector search (Qdrant) → resolve parent (Postgres) → return chunks

After (this guide):
query → embed
   ↓                    ↓
vector search      keyword search
   ↓                    ↓
        merge (RRF)
           ↓
     rerank (top 5)
           ↓
  generate answer (LLM, using parent chunks)
           ↓
        citations
```

Work through these steps **in order**. Each has a clear "done when."

---

## Step 1 — Metadata filtering

Right now `/search` searches across *every* document in the collection. Real usage needs scoping — "search only within this document," "only pages 10+," etc.

- Qdrant supports payload filters natively (`must`/`should` conditions) — your child chunk payloads already carry `document_id`, `document_name`, `start_page`, `end_page`, so no schema change needed.
- Add optional query params to `/search` (`document_id`, `page_gte`, etc.) that build a Qdrant `filter` object, passed alongside the vector in the same `query()` call — this is a **pre-filter** (restricts the search space before ranking), not a post-filter (search everything, then discard) — pre-filtering is both faster and more correct, since post-filtering can return fewer than `limit` results even when enough matches exist.

**Done when:** searching with a `document_id` filter only ever returns chunks from that document, and omitting the filter behaves exactly as it does today.

---

## Step 2 — Keyword (lexical) search alongside vector search

Vector search misses exact terms it hasn't learned to associate — an exact policy number, a product SKU, an acronym. Keyword search catches what embeddings blur.

- Qdrant supports full-text match filters on payload fields — since `text` is already stored in each child chunk's payload, you can add a text index on that field and run a keyword query against the same collection, no second database needed.
- This produces a **second ranked list**, separate from the vector search's ranked list, for the same query.

**Decision point:** don't try to merge these two lists inside the query yet — keep them as two separate result sets first. Merging is Step 3, and debugging a merge is much harder if you can't first confirm each input list independently makes sense.

**Done when:** for a query containing an exact term (e.g. a section number), the keyword list surfaces it even in cases where the vector list ranks it low or misses it entirely.

---

## Step 3 — Merge results (Reciprocal Rank Fusion)

Combine the two ranked lists from Steps 1–2 into one, without needing to normalize incompatible scores (cosine similarity and keyword match scores aren't on the same scale).

- RRF formula, applied per chunk: `score = Σ 1 / (k + rank)` across whichever lists it appears in (`k` is a small constant, ~60 is the commonly used default — dampens the impact of rank 1 vs rank 2 while still rewarding high rank).
- A chunk appearing near the top of *both* lists outranks one that's top of only one — this is the actual value of hybrid search, not just "search twice."

**Done when:** the merged list is a single ranked array, and a manual spot-check confirms chunks strong in both signals rank above chunks strong in only one.

---

## Step 4 — Reranking

The merge step (RRF) is cheap but crude — a real reranker model looks at the actual query+chunk pair together, not just rank position.

- Retrieve more than you need from Step 3 (e.g. top 20–30), then rerank down to the final top 5 using a dedicated reranker — Cohere's Rerank API is the fastest to integrate (single REST call, no self-hosting).
- This is a **separate model call** from both embeddings and the LLM — budget for its own latency and cost, same as you did for the embedding model.

**Decision point:** rerank the RRF-merged list from Step 3, not the raw vector-only results — reranking after hybrid merge means the reranker is refining an already-better candidate set, not compensating for a weaker one.

**Done when:** for a handful of test queries, the top result after reranking is subjectively better-matched than the top result before it (this is exactly what `evals-guide.md`'s Hit Rate/MRR will let you measure objectively instead of eyeballing).

---

## Step 5 — Add basic answer generation

This is technically part of "Phase 1 — Basic RAG" from the original plan (`LLM → Answer`) but got skipped — the pipeline currently stops at returning chunks, nothing calls an LLM to actually answer the question. Needed now because Step 6 (citations) and the evals guide's generation metrics both depend on it existing.

- New endpoint (or extend `/search`): take the reranked top-k parent chunks (not child chunks — parents have the full context), build a prompt with the question + concatenated parent texts, call the LLM, return the generated answer.
- Keep the prompt simple at first: "Answer the question using only the provided context. If the context doesn't contain the answer, say so." — resist adding query rewriting or multi-step reasoning here, that's Phase 3.

**Done when:** hitting the endpoint with a real question returns a coherent answer grounded in your actual documents, not the LLM's general knowledge.

---

## Step 6 — Citations

Once Step 5 exists, attach *where* each part of the answer came from — not just returning chunks alongside the answer, but making the source traceable per claim.

- Simplest version: return the answer plus a `sources` array (`document_name`, `section_title`, `start_page`–`end_page`) for every parent chunk used in the prompt — this alone is useful even without inline attribution.
- More advanced version (optional, do this only after the simple version works): ask the LLM to include inline markers (e.g. `[1]`, `[2]`) in the answer text itself, mapped to the `sources` array by index.

**Done when:** every generated answer ships with enough metadata that a user could go find the exact page it came from, without you having to manually cross-reference anything.

---

## Order of implementation

1. Metadata filtering (Step 1) — smallest change, immediate value, no new dependencies
2. Keyword search as a separate result list (Step 2)
3. RRF merge (Step 3)
4. Reranker integration (Step 4)
5. Answer generation endpoint (Step 5)
6. Citations attached to generated answers (Step 6)

Run the retrieval eval script (`evals-guide.md`) after Step 4 specifically — that's the point where you can objectively confirm hybrid search + reranking actually improved Hit Rate/MRR over the baseline, instead of assuming it did because it sounds like it should.

---

## Things to explicitly *not* do yet

- **Query rewriting / multi-query retrieval** — real technique, but it's a query-understanding problem layered on top of a retrieval pipeline that doesn't need it yet. Add it only if you find retrieval still struggling with vague queries *after* Steps 1–4 are in place.
- **Async ingestion queue (BullMQ/Redis)** — your current synchronous ingestion works fine at current document volume. Don't add queue infrastructure before it's actually a bottleneck.
- **Full observability platform (Langfuse etc.)** — a few `console.log`s with latency timestamps around each pipeline stage gets you 80% of the debugging value for a fraction of the setup cost, until this is a multi-user production system.
