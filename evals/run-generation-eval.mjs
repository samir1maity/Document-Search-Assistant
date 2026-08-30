// Standalone generation eval — run manually, not exposed as an API route.
//   node evals/run-generation-eval.mjs
//
// Runs the full pipeline (retrieval → rerank → generate) per question, then
// scores the generated answer with three LLM-as-judge checks: Faithfulness
// (grounded in context?), Relevance (addresses the question?), Correctness
// (matches expected_answer? only if the dataset entry has one).

import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import searchService from '../src/services/search.service.js'
import { judgeFaithfulness, judgeRelevance, judgeCorrectness } from './judge.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function loadDataset() {
   const raw = await readFile(path.join(__dirname, 'golden-dataset.json'), 'utf-8')
   return JSON.parse(raw)
}

function buildContext(results) {
   return results
      .filter(result => result.parent)
      .map(result => result.parent.text)
      .join('\n\n')
}

async function evaluateEntry(entry) {
   const { results, answer } = await searchService.searchAndAnswer({ query: entry.question })
   const context = buildContext(results)

   const [faithfulness, relevance, correctness] = await Promise.all([
      judgeFaithfulness({ context, answer }),
      judgeRelevance({ question: entry.question, answer }),
      entry.expected_answer
         ? judgeCorrectness({ answer, expectedAnswer: entry.expected_answer })
         : Promise.resolve(null)
   ])

   return {
      question: entry.question,
      answer,
      faithful: faithfulness.faithful,
      faithfulness_reasoning: faithfulness.reasoning,
      relevance_score: relevance.score,
      correctness_score: correctness?.score ?? null
   }
}

function printReport(evaluations) {
   console.log('\n' + 'Question'.padEnd(40) + 'Faithful'.padEnd(10) + 'Relevance'.padEnd(11) + 'Correctness')
   console.log('-'.repeat(90))

   for (const e of evaluations) {
      console.log(
         truncate(e.question, 38).padEnd(40) +
         (e.faithful ? 'Y' : 'N').padEnd(10) +
         `${e.relevance_score}/5`.padEnd(11) +
         (e.correctness_score !== null ? `${e.correctness_score}/5` : 'n/a')
      )
   }

   const faithfulCount = evaluations.filter(e => e.faithful).length
   const faithfulRate = faithfulCount / evaluations.length
   const avgRelevance = average(evaluations.map(e => e.relevance_score))
   const correctnessScores = evaluations.map(e => e.correctness_score).filter(score => score !== null)
   const avgCorrectness = correctnessScores.length ? average(correctnessScores) : null

   console.log('-'.repeat(90))
   console.log(`Faithfulness: ${(faithfulRate * 100).toFixed(1)}% (${faithfulCount}/${evaluations.length})`)
   console.log(`Avg Relevance: ${avgRelevance.toFixed(2)}/5`)
   console.log(`Avg Correctness: ${avgCorrectness !== null ? avgCorrectness.toFixed(2) + '/5' : 'n/a (no expected_answer in dataset)'}`)

   return { faithful_rate: faithfulRate, avg_relevance: avgRelevance, avg_correctness: avgCorrectness }
}

function average(numbers) {
   return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function truncate(text, maxLength) {
   return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function saveResults(evaluations, scores) {
   const resultsDir = path.join(__dirname, 'results')
   await mkdir(resultsDir, { recursive: true })

   const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
   const outPath = path.join(resultsDir, `generation-${timestamp}.json`)

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
