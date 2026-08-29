// Standalone retrieval eval — run manually, not exposed as an API route.
//   node evals/run-retrieval-eval.mjs
//
// Scores: Hit Rate@k (did the right section show up at all) and MRR (how
// far down the list it was). A "match" is compared on document_name +
// section_title from the payload — avoids an extra DB lookup during eval runs.

import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import embeddingService from '../src/services/embedding.service.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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

// 1-indexed rank of the first matching result, or 0 if none of the top-k match
function findMatchRank(results, { expected_document, expected_section }) {
   const index = results.findIndex(result =>
      result.document_name === expected_document && result.section_title === expected_section
   )
   return index === -1 ? 0 : index + 1
}

async function evaluateEntry(entry) {
   const results = await runQuestion(entry)
   const rank = findMatchRank(results, entry)

   return {
      question: entry.question,
      expected: `${entry.expected_document} / ${entry.expected_section}`,
      hit: rank > 0,
      rank,
      reciprocal_rank: rank > 0 ? 1 / rank : 0,
      top_result: results[0] ? `${results[0].document_name} / ${results[0].section_title}` : '(none)'
   }
}

function printReport(evaluations) {
   console.log('\n' + 'Question'.padEnd(40) + 'Expected'.padEnd(35) + 'Hit'.padEnd(5) + 'Rank'.padEnd(6) + 'Top result')
   console.log('-'.repeat(120))

   for (const e of evaluations) {
      console.log(
         truncate(e.question, 38).padEnd(40) +
         truncate(e.expected, 33).padEnd(35) +
         (e.hit ? 'Y' : 'N').padEnd(5) +
         String(e.rank || '-').padEnd(6) +
         e.top_result
      )
   }

   const hits = evaluations.filter(e => e.hit).length
   const hitRate = hits / evaluations.length
   const mrr = evaluations.reduce((sum, e) => sum + e.reciprocal_rank, 0) / evaluations.length

   console.log('-'.repeat(120))
   console.log(`Hit Rate@${TOP_K}: ${(hitRate * 100).toFixed(1)}% (${hits}/${evaluations.length})`)
   console.log(`MRR: ${mrr.toFixed(3)}`)

   return { hit_rate: hitRate, mrr, top_k: TOP_K }
}

function truncate(text, maxLength) {
   return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function saveResults(evaluations, scores) {
   const resultsDir = path.join(__dirname, 'results')
   await mkdir(resultsDir, { recursive: true })

   const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
   const outPath = path.join(resultsDir, `${timestamp}.json`)

   await writeFile(outPath, JSON.stringify({ timestamp, scores, evaluations }, null, 2))
   console.log(`\nSaved: evals/results/${path.basename(outPath)}`)
}

async function main() {
   const dataset = await loadDataset()
   const evaluations = []

   for (const entry of dataset) {
      evaluations.push(await evaluateEntry(entry))
   }

   const scores = printReport(evaluations)
   await saveResults(evaluations, scores)
}

main()
   .catch(error => {
      console.error(error)
      process.exit(1)
   })
