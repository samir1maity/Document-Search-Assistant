// Standalone retrieval eval — run manually, not exposed as an API route.
//   node evals/run-retrieval-eval.mjs
//
// Scores: Hit Rate@k (did a relevant section show up at all), MRR (how far
// down the list the first relevant one was), Context Precision@k (what
// fraction of the retrieved chunks were actually relevant, vs. noise),
// Context Recall@k (what fraction of the known-relevant chunks we actually
// retrieved — precision alone can't catch a pipeline that returns one right
// chunk and misses three others it should have found), and latency (how
// long retrieval took). A "match" is compared on document_name +
// section_title from the payload — avoids an extra DB lookup during eval
// runs. A dataset entry can list multiple relevant chunks via
// `expected_matches`; entries with a single expected_document/section still
// work unchanged (see golden-dataset.json).

import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import embeddingService from '../src/services/embedding.service.js'
import { loadPreviousRun, printComparison } from './compare.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.join(__dirname, 'results')
const RESULTS_PREFIX = 'retrieval-'
const TOP_K = 5

async function loadDataset() {
   const raw = await readFile(path.join(__dirname, 'golden-dataset.json'), 'utf-8')
   return JSON.parse(raw)
}

async function runQuestion({ question }) {
   const queryEmbedding = await embeddingService.embedQuery({ query: question })
   const matches = await embeddingService.searchChildChunks({ queryEmbedding, limit: TOP_K })

   return matches.map(match => ({
      document_name: match.payload.document_name,
      section_title: match.payload.section_title,
      score: match.score
   }))
}

// the set of relevant chunks for an entry — either an explicit list
// (multiple relevant sections) or the single expected_document/section pair
function getExpectedMatches(entry) {
   if (Array.isArray(entry.expected_matches) && entry.expected_matches.length > 0) {
      return entry.expected_matches;
   }
   return [{ document: entry.expected_document, section: entry.expected_section }];
}

function isMatch(result, { document, section }) {
   return result.document_name === document && result.section_title === section
}

// 1-indexed rank of the first result matching any relevant chunk, or 0 if none of the top-k match
function findMatchRank(results, expectedMatches) {
   const index = results.findIndex(result => expectedMatches.some(expected => isMatch(result, expected)))
   return index === -1 ? 0 : index + 1
}

// fraction of the retrieved set that's actually relevant — signal vs. noise
function contextPrecision(results, expectedMatches) {
   if (results.length === 0) return 0;
   return results.filter(result => expectedMatches.some(expected => isMatch(result, expected))).length / results.length;
}

// fraction of the known-relevant chunks that were actually retrieved — coverage vs. missed context
function contextRecall(results, expectedMatches) {
   if (expectedMatches.length === 0) return 0;
   const foundCount = expectedMatches.filter(expected => results.some(result => isMatch(result, expected))).length
   return foundCount / expectedMatches.length;
}

async function evaluateEntry(entry) {
   const startedAt = Date.now()
   const results = await runQuestion(entry)
   const latencyMs = Date.now() - startedAt

   const expectedMatches = getExpectedMatches(entry)
   const rank = findMatchRank(results, expectedMatches)

   return {
      question: entry.question,
      expected: expectedMatches.map(({ document, section }) => `${document} / ${section}`).join('; '),
      hit: rank > 0,
      rank,
      reciprocal_rank: rank > 0 ? 1 / rank : 0,
      context_precision: contextPrecision(results, expectedMatches),
      context_recall: contextRecall(results, expectedMatches),
      latency_ms: latencyMs,
      top_result: results[0] ? `${results[0].document_name} / ${results[0].section_title}` : '(none)'
   }
}

function printReport(evaluations) {
   console.log('\n' + 'Question'.padEnd(34) + 'Expected'.padEnd(29) + 'Hit'.padEnd(5) + 'Rank'.padEnd(6) + 'Prec'.padEnd(6) + 'Recall'.padEnd(8) + 'ms'.padEnd(7) + 'Top result')
   console.log('-'.repeat(138))

   for (const e of evaluations) {
      console.log(
         truncate(e.question, 32).padEnd(34) +
         truncate(e.expected, 27).padEnd(29) +
         (e.hit ? 'Y' : 'N').padEnd(5) +
         String(e.rank || '-').padEnd(6) +
         e.context_precision.toFixed(2).padEnd(6) +
         e.context_recall.toFixed(2).padEnd(8) +
         String(e.latency_ms).padEnd(7) +
         e.top_result
      )
   }

   const hits = evaluations.filter(e => e.hit).length
   const hitRate = hits / evaluations.length
   const mrr = evaluations.reduce((sum, e) => sum + e.reciprocal_rank, 0) / evaluations.length
   const avgContextPrecision = evaluations.reduce((sum, e) => sum + e.context_precision, 0) / evaluations.length
   const avgContextRecall = evaluations.reduce((sum, e) => sum + e.context_recall, 0) / evaluations.length
   const avgLatencyMs = evaluations.reduce((sum, e) => sum + e.latency_ms, 0) / evaluations.length

   console.log('-'.repeat(138))
   console.log(`Hit Rate@${TOP_K}: ${(hitRate * 100).toFixed(1)}% (${hits}/${evaluations.length})`)
   console.log(`MRR: ${mrr.toFixed(3)}`)
   console.log(`Context Precision@${TOP_K}: ${avgContextPrecision.toFixed(3)}`)
   console.log(`Context Recall@${TOP_K}: ${avgContextRecall.toFixed(3)}`)
   console.log(`Avg latency: ${avgLatencyMs.toFixed(0)}ms`)

   return { hit_rate: hitRate, mrr, context_precision: avgContextPrecision, context_recall: avgContextRecall, avg_latency_ms: avgLatencyMs, top_k: TOP_K }
}

function truncate(text, maxLength) {
   return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function saveResults(evaluations, scores) {
   await mkdir(RESULTS_DIR, { recursive: true })

   const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
   const outPath = path.join(RESULTS_DIR, `${RESULTS_PREFIX}${timestamp}.json`)

   await writeFile(outPath, JSON.stringify({ timestamp, scores, evaluations }, null, 2))
   console.log(`\nSaved: evals/results/${path.basename(outPath)}`)
}

const COMPARISON_METRICS = [
   { key: 'hit_rate', label: 'Hit Rate', higherIsBetter: true, decimals: 3 },
   { key: 'mrr', label: 'MRR', higherIsBetter: true, decimals: 3 },
   { key: 'context_precision', label: 'Context Precision', higherIsBetter: true, decimals: 3 },
   { key: 'context_recall', label: 'Context Recall', higherIsBetter: true, decimals: 3 },
   { key: 'avg_latency_ms', label: 'Avg Latency (ms)', higherIsBetter: false, decimals: 0 }
]

async function main() {
   const dataset = await loadDataset()
   const evaluations = []

   for (const entry of dataset) {
      evaluations.push(await evaluateEntry(entry))
   }

   const scores = printReport(evaluations)

   const previousRun = await loadPreviousRun(RESULTS_DIR, RESULTS_PREFIX)
   printComparison(previousRun, scores, COMPARISON_METRICS)

   await saveResults(evaluations, scores)
}

main()
   .catch(error => {
      console.error(error)
      process.exit(1)
   })
