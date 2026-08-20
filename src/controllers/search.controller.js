import embeddingService from '../services/embedding.service.js'
import chunkingService from '../services/chunking.service.js'
import answerService from '../services/answer.service.js'
import catchAsync from '../utils/catchAsync.js'
import AppError from '../utils/AppError.js'

export const handleSearch = catchAsync(async (req, res) => {
   const { query, limit } = req.query

   if (!query) {
      throw new AppError('Missing required query param "query".', 400)
   }

   const queryEmbedding = await embeddingService.embedQuery({ query })

   const matches = await embeddingService.searchChildChunks({
      queryEmbedding,
      limit: limit ? Number(limit) : 5
   })

   const results = await Promise.all(matches.map(async (match) => {
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

   const answer = await answerService.generateAnswer({ query, results })

   res.status(200).json({
      data: results,
      answer,
      success: true
   })
})

export default {
   handleSearch
}
