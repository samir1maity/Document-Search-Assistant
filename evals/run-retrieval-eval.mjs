// Standalone retrieval eval — run manually, not exposed as an API route.
//   node evals/run-retrieval-eval.mjs
//
// Step 2 (scaffold): no scoring yet — just confirms the harness works by
// printing the raw top-k results for every question in the golden dataset.

import 'dotenv/config'
import { readFile } from 'fs/promises'
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

async function main() {
   const dataset = await loadDataset()

   for (const entry of dataset) {
      const results = await runQuestion(entry)

      console.log(`\nQ: ${entry.question}`)
      console.log(`   expected: ${entry.expected_document} / ${entry.expected_section}`)
      results.forEach((result, index) => {
         console.log(`   [${index + 1}] ${result.document_name} / ${result.section_title} (score: ${result.score.toFixed(4)})`)
      })
   }
}

main()
   .catch(error => {
      console.error(error)
      process.exit(1)
   })
