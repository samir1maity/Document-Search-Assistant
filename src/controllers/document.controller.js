import documentService from '../services/document-parser.service.js'
import chunkingService from '../services/chunking.service.js'
import catchAsync from '../utils/catchAsync.js'
import AppError from '../utils/AppError.js'

export const handleDocument = catchAsync(async (req, res) => {
   if (!req.file) {
      throw new AppError('No file uploaded. Attach a PDF under the "file" field.', 400)
   }

   const data = await documentService.documentParser(req.file.buffer, req.file.originalname, req.file.mimetype)

   const flatItems = chunkingService.handlePdfData({ data })

   res.status(200).json({
      data: flatItems,
      success: true
   })
})

export default {
   handleDocument
}
