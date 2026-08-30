import searchService from '../services/search.service.js'
import catchAsync from '../utils/catchAsync.js'
import AppError from '../utils/AppError.js'

export const handleSearch = catchAsync(async (req, res) => {
   const { query, limit, document_id, page_gte, page_lte } = req.query

   if (!query) {
      throw new AppError('Missing required query param "query".', 400)
   }

   const filter = searchService.buildFilter({ document_id, page_gte, page_lte })
   const resultLimit = limit ? Number(limit) : 5

   const { results, answer, sources } = await searchService.searchAndAnswer({ query, limit: resultLimit, filter })

   res.status(200).json({
      data: results,
      answer,
      sources,
      success: true
   })
})

export default {
   handleSearch
}
