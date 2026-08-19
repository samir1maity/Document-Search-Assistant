# RAG Evaluation — Step-by-Step Guide

This is the implementation plan for `evals/`, covering the pipeline:

```
Golden dataset (question + expected section/doc)
   ↓
For each question: embedQuery → searchChildChunks
   ↓
Compare results vs. expected
   ↓
Hit Rate@k, MRR, Context Precision
   ↓
(Later, once generation exists) LLM-as-judge → Faithfulness / Relevance / Correctness
```

Work through these steps **in order**. Each step has a clear "done when" so you know when to move to the next.

**Scope note:** the pipeline currently ends at retrieval (`GET /api/v1/search`) — there's no generation step yet (nothing calls an LLM to produce an answer from retrieved chunks). So Steps 1–5 below (retrieval evals) are usable today. Steps 6+ (generation evals) are blocked until an "answer" endpoint exists — don't try to build them early.

---

## Step 1 — Build a golden dataset

Before writing any eval code, decide what "correct" means for a handful of real questions.

- One JSON file, one entry per question, tied to documents you've actually uploaded:
  ```json
  {
    "question": "What is the refund window for digital products?",
    "expected_document": "RefundPolicy.pdf",
    "expected_section": "2. Eligibility for Refunds"
  }
  ```
- Start with ~10–15 questions. Fewer than that and metrics are too noisy to trust; more than that isn't worth it before you've even seen a first result.
- Write questions the way a real user would ask them, not the way the section title reads — otherwise you're testing keyword match, not retrieval quality.

**Done when:** you have a dataset file with real questions against documents already sitting in your DB/Qdrant.

---

## Step 2 — Build the eval runner scaffold

A standalone script, not an API route — evals are run manually/offline, not exposed to users.

- Location: `evals/run-retrieval-eval.mjs` (a new top-level `evals/` folder, outside `src/` — it's tooling, not app logic).
- For each dataset entry: call `embedQuery` → `searchChildChunks` (reuse `embedding.service.js` directly, no need to go through HTTP).
- Collect, per question: the ranked list of results returned, each with its `section_title`/`document_name`.

**Done when:** running the script prints the raw top-k results for every question in the dataset — no scoring yet, just confirming the harness works.

---

## Step 3 — Implement Hit Rate@k

The simplest, most valuable metric: did the right answer show up *at all*.

- For each question: check whether any of the top-k results match `expected_section` (and `expected_document`, since section titles can repeat across docs).
- `Hit Rate@k = (# questions with a match in top-k) / (total questions)`.

**Decision point:** what counts as a "match" — the child chunk's `section_title`, or its `parent_id`'s section? Use `section_title` from the payload; it's already there and avoids an extra DB lookup during eval runs.

**Done when:** you have one number (e.g. "8/12 hit rate at k=5") that tells you, at a glance, whether retrieval is even in the right neighborhood.

---

## Step 4 — Implement MRR (Mean Reciprocal Rank)

Hit Rate tells you *if* it found the answer; MRR tells you *how far down* the list it was.

- For each question: find the rank (1-indexed) of the first matching result. If none match, that question's reciprocal rank is `0`.
- `MRR = average(1 / rank)` across all questions.
- A hit at rank 1 scores `1.0`; a hit at rank 5 scores `0.2`; no hit scores `0`.

**Done when:** you have a single MRR score alongside Hit Rate — together they tell you both "does it find things" and "does it rank them well."

---

## Step 5 — Report output

Make the results readable at a glance, not just raw numbers in a variable.

- Print a simple table: question | expected section | hit? | rank | top result returned.
- Print the two aggregate scores (Hit Rate@k, MRR) at the bottom.
- Optionally write the same data to a JSON file (`evals/results/<timestamp>.json`) so you can track whether scores improve as you tune chunking/embedding decisions later.

**Done when:** running `node evals/run-retrieval-eval.mjs` gives you a scannable report, not a wall of console.log output you have to parse by eye.

---

## Step 6 — (Blocked) Add generation evals once an answer step exists

Not buildable yet — revisit once you add an endpoint that actually generates an answer from retrieved parent chunks.

- **Faithfulness / Groundedness** — LLM-as-judge prompt: "Given this context and this answer, is every claim in the answer supported by the context? Answer yes/no with reasoning."
- **Answer Relevance** — LLM-as-judge, score 1–5: does the answer actually address the question asked?
- **Correctness** — compare the generated answer to the dataset's `expected_answer` field (add this field to Step 1's dataset once you reach this point) — use LLM-as-judge for semantic comparison, not exact string match, since free-text answers won't match verbatim.

**Done when:** each dataset question has a generated answer plus three scores (faithfulness, relevance, correctness), and you can spot which failures are retrieval problems (Steps 1–5 already ruled this out) vs. generation problems (the LLM had the right context but answered poorly anyway).

---

## Order of implementation

1. Golden dataset — 10–15 real questions (Step 1)
2. Eval runner scaffold, no scoring yet (Step 2)
3. Hit Rate@k (Step 3)
4. MRR (Step 4)
5. Readable report output (Step 5)
6. Generation evals — only after an answer-generation endpoint exists (Step 6)

Run the retrieval eval *before* touching hybrid search/reranking (Phase 2 of the project plan) and again *after* — that before/after comparison is the actual point of building evals: proving a change helped, instead of assuming it did.
