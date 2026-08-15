# Parent-Child Chunking — Step-by-Step Guide

This is the implementation plan for `chunking.service.js`, covering the pipeline:

```
PDF → Parser → Document elements → Detect headings/sections
    → Parent chunks → Child chunks → Embed children → Vector DB
```

Work through these steps **in order**. Each step has a clear "done when" so you know when to move to the next.

---

## Step 1 — Get the parsed input in the right shape

Before writing any chunking logic, confirm what you're chunking *from*.

- Input: `result.items.pages` from `document-parser.service.js` (the structured JSON, not `markdown_full`).
- Each page is `{ page_number, items: [...] }`, each item has a `type` (`heading`, `text`, `table`, `list`, ...).
- Flatten all pages into a single ordered list of items first, keeping `page_number` attached to each item. Reading order across pages matters more than page boundaries at this stage — a section can span two pages.

**Done when:** you have one flat array like `[{ type, md, page_number }, ...]` covering the whole document, in reading order.

---

## Step 2 — Detect section boundaries

Walk the flat item list and mark where each new section starts.

- A new section starts at every `type === "heading"` item.
- Decide whether *all* heading levels start a new parent section, or only levels 1–2 (level 3+ often means a sub-point, not worth its own parent chunk). Pick one rule and stay consistent — this decision shapes how big your parent chunks end up.
- Everything between one heading and the next belongs to that section (including tables/lists/text).

**Done when:** you can describe, for any item in the array, which section it belongs to.

---

## Step 3 — Build parent chunks

A parent chunk = one section's full content, kept together.

- For each section: concatenate its items' `md` text into one block, and record its heading text as the section title.
- Attach metadata to the parent chunk: `document_id`, `section_title`, `start_page`, `end_page`.
- Give each parent chunk a stable `parent_id` (e.g. `docId-section-3`).

**Decision point:** what if a section has no heading (e.g. content before the first heading, or a heading-less document)? Treat it as an implicit "Introduction" / untitled parent section rather than dropping it.

**Done when:** you have a list of parent chunks, each with an id, title, full text, and page range — this is what you'll hand to the LLM later at answer time.

---

## Step 4 — Decide if a parent needs splitting into children

Not every parent chunk needs children — a short section can be its own single child too. The reason to split is **embedding quality**: embedding models work best on focused, moderately-sized text, and a 3-page section embedded as one vector loses precision (it becomes "about everything and nothing").

- Pick a target child size in tokens (~300–500 tokens is a reasonable starting point) and a max size before you force a split (~800 tokens).
- If a parent's full text is under the max, it can be a single child chunk of itself.
- If it's over, move to Step 5.

**Done when:** you have a rule like "if parent text > N tokens, split; else, parent = its own single child."

---

## Step 5 — Split large parents into child chunks

Only for parents that exceeded the size limit in Step 4.

- Split on paragraph boundaries first (blank lines), not mid-sentence — this is where you use the item-level structure again (don't split a table row in half, don't split a list item in half).
- If a single paragraph/table is itself too large, fall back to sentence-level splitting.
- Use a small overlap between consecutive child chunks (~10–15% of chunk size) so context isn't lost right at a boundary.

**Done when:** every child chunk is under your max size, and every child chunk still traces back to exactly one `parent_id`.

---

## Step 6 — Attach metadata to every child chunk

Each child chunk needs enough metadata to be useful both for retrieval-time filtering (Phase 2 of your project) and citations (Phase 4):

```
chunk_id
parent_id
document_id
document_name
section_title
page_number (or page range, if it spans pages)
```

**Done when:** a child chunk is a self-contained record — you could hand just this object to another part of the system and it would know exactly where it came from.

---

## Step 7 — Store parent chunks separately

Parents are **not** embedded, so they don't belong in the vector DB. Store them wherever you already store document metadata (Postgres, or even a JSON/key-value store for now).

- Key: `parent_id`
- Value: full section text + metadata (title, page range)

This is what gets fetched at answer time once a child chunk matches a query — the small child got you found, the parent gives the LLM enough context to actually answer well.

**Done when:** given a `parent_id`, you can look up the full parent text independently of any vector search.

---

## Step 8 — Embed only the child chunks

Now, and only now, call your embedding model — one embedding call per child chunk (or batched, if your embedding provider supports batch input).

**Done when:** every child chunk has a corresponding embedding vector.

---

## Step 9 — Store children in the vector DB

Insert each child chunk into your vector DB with:

- the embedding vector
- the metadata from Step 6 (`parent_id` is the critical field — it's the link back to Step 7's store)

**Done when:** a similarity search against the vector DB returns child chunks whose metadata includes a resolvable `parent_id`.

---

## Step 10 — Verify the retrieval-time flow works end to end

Before moving on to hybrid search/reranking (Phase 2), confirm the basic parent-child loop works:

1. Embed a test query.
2. Search the vector DB → get top-k child chunks.
3. For each result, use `parent_id` to fetch the full parent section from Step 7's store.
4. Confirm the parent text you get back actually contains the child chunk's text (sanity check that the link is correct).

**Done when:** step 3 reliably returns richer context than the child chunk alone, and you can see *why* parent-child retrieval was worth building instead of just embedding whole sections.

---

## Order of implementation (do these in separate small commits)

1. Flatten parsed items → ordered list (Step 1)
2. Section detection function (Step 2)
3. Parent chunk builder (Step 3)
4. Size-based split decision (Step 4)
5. Child chunk splitter (Step 5) + metadata (Step 6)
6. Parent store (Step 7)
7. Embedding call for children (Step 8)
8. Vector DB insert (Step 9)
9. End-to-end manual test with one real PDF (Step 10)

Don't jump ahead to embeddings/vector DB before Steps 1–6 are solid and you've manually inspected the parent/child output for at least one real document — chunking bugs are much cheaper to catch by eyeballing chunk boundaries than by debugging bad retrieval results later.
