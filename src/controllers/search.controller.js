import embeddingService from '../services/embedding.service.js'
import chunkingService from '../services/chunking.service.js'
import answerService from '../services/answer.service.js'
import catchAsync from '../utils/catchAsync.js'
import AppError from '../utils/AppError.js'

// scope the vector search down before ranking, not after — cheaper and never short-changes `limit`
function buildFilter({ document_id, page_gte, page_lte }) {
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

// shared shape for both vector and keyword matches, so callers can compare them apples-to-apples
async function resolveMatches(matches) {
   return Promise.all(matches.map(async (match) => {
      const parent = await chunkingService.getParentChunkById(match.payload.parent_id)

      return {
         score: match.score,
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

export const handleSearch = catchAsync(async (req, res) => {
   const { query, limit, document_id, page_gte, page_lte } = req.query

   if (!query) {
      throw new AppError('Missing required query param "query".', 400)
   }

   const filter = buildFilter({ document_id, page_gte, page_lte })
   const resultLimit = limit ? Number(limit) : 5

   const queryEmbedding = await embeddingService.embedQuery({ query })

   const [vectorMatches, keywordMatches] = await Promise.all([
      embeddingService.searchChildChunks({ queryEmbedding, limit: resultLimit, filter }),
      embeddingService.searchChildChunksByKeyword({ query, limit: resultLimit, filter })
   ])

   const results = await resolveMatches(vectorMatches)
   // kept separate from `results` for now — not merged into ranking or fed to the LLM yet
   const keywordResults = await resolveMatches(keywordMatches)

   const answer = await answerService.generateAnswer({ query, results })

   res.status(200).json({
      data: results,
      keyword_data: keywordResults,
      answer,
      success: true
   })
})

export default {
   handleSearch
}
