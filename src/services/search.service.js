import embeddingService from './embedding.service.js'
import chunkingService from './chunking.service.js'
import answerService from './answer.service.js'
import rerankService from './rerank.service.js'
import mergeWithRRF from '../utils/rrf.js'
import constants from '../config/constants.js'

// scope the vector search down before ranking, not after — cheaper and never short-changes `limit`
function buildFilter({ document_id, page_gte, page_lte } = {}) {
   const must = []

   if (document_id) {
      must.push({ key: 'document_id', match: { value: document_id } })
   }
   if (page_gte) {
      must.push({ key: 'end_page', range: { gte: Number(page_gte) } })
   }
   if (page_lte) {
      must.push({ key: 'start_page', range: { lte: Number(page_lte) } })
   }

   return must.length ? { must } : undefined
}

// resolves the parent chunk for each merged match
async function resolveMatches(matches) {
   return Promise.all(matches.map(async (match) => {
      const parent = await chunkingService.getParentChunkById(match.payload.parent_id)

      return {
         score: match.rerank_score ?? match.rrf_score,
         chunk: {
            chunk_id: match.payload.chunk_id,
            section_title: match.payload.section_title,
            text: match.payload.text
         },
         parent: parent && {
            parent_id: parent.id,
            document_name: match.payload.document_name,
            section_title: parent.sectionTitle,
            text: parent.text,
            start_page: parent.startPage,
            end_page: parent.endPage
         }
      }
   }))
}

// full pipeline: vector + keyword search → RRF merge → rerank → resolve → generate answer.
// shared by the /search route and the eval scripts, so both exercise the same logic.
async function searchAndAnswer({ query, limit = 5, filter }) {
   const queryEmbedding = await embeddingService.embedQuery({ query })

   // cast a wide net here — reranking below is what narrows it down to `limit`
   const poolLimit = constants.rerank.POOL_LIMIT

   const [vectorMatches, keywordMatches] = await Promise.all([
      embeddingService.searchChildChunks({ queryEmbedding, limit: poolLimit, filter }),
      embeddingService.searchChildChunksByKeyword({ query, limit: poolLimit, filter })
   ])

   const mergedMatches = mergeWithRRF([vectorMatches, keywordMatches], {
      getKey: match => match.payload.chunk_id
   })

   const rerankedMatches = await rerankService.rerankMatches({ query, matches: mergedMatches, topN: limit })

   const results = await resolveMatches(rerankedMatches)

   const { answer, sources } = await answerService.generateAnswer({ query, results })

   return { results, answer, sources }
}

export default {
   buildFilter,
   searchAndAnswer
}
