// Standalone generation eval — run manually, not exposed as an API route.
//   node evals/run-generation-eval.mjs
//
// Runs the full pipeline (retrieval → rerank → generate) per question, then
// scores the generated answer with three LLM-as-judge checks: Faithfulness
// (grounded in context?), Relevance (addresses the question?), Correctness
// (matches expected_answer? only if the dataset entry has one). Also tracks
// pipeline latency separately from judge latency — a slow answer and a slow
// judge call are different problems to chase down.
//
// Exits non-zero (without stopping the report/save) if any metric regressed
// vs. the previous saved run, or fell below a minimum configured in
// evals/thresholds.json under a "generation" key — e.g. { "generation": {
// "faithful_rate": 0.8 } }. That file is optional; with no previous run and
// no thresholds.json, the gate always passes.

import 'dotenv/config'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import path from 'path'
import searchService from '../src/services/search.service.js'
import { judgeFaithfulness, judgeRelevance, judgeCorrectness } from './judge.mjs'
import { loadPreviousRun, printComparison, loadThresholds, findRegressions, findThresholdFailures, printGate } from './compare.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = path.join(__dirname, 'results')
const RESULTS_PREFIX = 'generation-'

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
   const pipelineStartedAt = Date.now()
   const { results, answer } = await searchService.searchAndAnswer({ query: entry.question })
   const pipelineLatencyMs = Date.now() - pipelineStartedAt

   const context = buildContext(results)

   const judgeStartedAt = Date.now()
   const [faithfulness, relevance, correctness] = await Promise.all([
      judgeFaithfulness({ context, answer }),
      judgeRelevance({ question: entry.question, answer }),
      entry.expected_answer
         ? judgeCorrectness({ answer, expectedAnswer: entry.expected_answer })
         : Promise.resolve(null)
   ])
   const judgeLatencyMs = Date.now() - judgeStartedAt

   return {
      question: entry.question,
      answer,
      faithful: faithfulness.faithful,
      faithfulness_reasoning: faithfulness.reasoning,
      relevance_score: relevance.score,
      correctness_score: correctness?.score ?? null,
      pipeline_latency_ms: pipelineLatencyMs,
      judge_latency_ms: judgeLatencyMs
   }
}

function printReport(evaluations) {
   console.log('\n' + 'Question'.padEnd(34) + 'Faithful'.padEnd(10) + 'Relevance'.padEnd(11) + 'Correctness'.padEnd(13) + 'Pipeline ms'.padEnd(13) + 'Judge ms')
   console.log('-'.repeat(105))

   for (const e of evaluations) {
      console.log(
         truncate(e.question, 32).padEnd(34) +
         (e.faithful ? 'Y' : 'N').padEnd(10) +
         `${e.relevance_score}/5`.padEnd(11) +
         (e.correctness_score !== null ? `${e.correctness_score}/5` : 'n/a').padEnd(13) +
         String(e.pipeline_latency_ms).padEnd(13) +
         String(e.judge_latency_ms)
      )
   }

   const faithfulCount = evaluations.filter(e => e.faithful).length
   const faithfulRate = faithfulCount / evaluations.length
   const avgRelevance = average(evaluations.map(e => e.relevance_score))
   const correctnessScores = evaluations.map(e => e.correctness_score).filter(score => score !== null)
   const avgCorrectness = correctnessScores.length ? average(correctnessScores) : null
   const avgPipelineLatencyMs = average(evaluations.map(e => e.pipeline_latency_ms))
   const avgJudgeLatencyMs = average(evaluations.map(e => e.judge_latency_ms))

   console.log('-'.repeat(105))
   console.log(`Faithfulness: ${(faithfulRate * 100).toFixed(1)}% (${faithfulCount}/${evaluations.length})`)
   console.log(`Avg Relevance: ${avgRelevance.toFixed(2)}/5`)
   console.log(`Avg Correctness: ${avgCorrectness !== null ? avgCorrectness.toFixed(2) + '/5' : 'n/a (no expected_answer in dataset)'}`)
   console.log(`Avg pipeline latency: ${avgPipelineLatencyMs.toFixed(0)}ms`)
   console.log(`Avg judge latency: ${avgJudgeLatencyMs.toFixed(0)}ms`)

   return {
      faithful_rate: faithfulRate,
      avg_relevance: avgRelevance,
      avg_correctness: avgCorrectness,
      avg_pipeline_latency_ms: avgPipelineLatencyMs,
      avg_judge_latency_ms: avgJudgeLatencyMs
   }
}

function average(numbers) {
   return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
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
   { key: 'faithful_rate', label: 'Faithfulness', higherIsBetter: true, decimals: 3 },
   { key: 'avg_relevance', label: 'Avg Relevance', higherIsBetter: true, decimals: 2 },
   { key: 'avg_correctness', label: 'Avg Correctness', higherIsBetter: true, decimals: 2 },
   { key: 'avg_pipeline_latency_ms', label: 'Avg Pipeline Latency (ms)', higherIsBetter: false, decimals: 0 }
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

   const thresholds = await loadThresholds(__dirname, 'generation')
   const passed = printGate({
      regressions: findRegressions(previousRun, scores, COMPARISON_METRICS),
      thresholdFailures: findThresholdFailures(scores, COMPARISON_METRICS, thresholds)
   })
   if (!passed) process.exitCode = 1;
}

main()
   .catch(error => {
      console.error(error)
      process.exit(1)
   })
