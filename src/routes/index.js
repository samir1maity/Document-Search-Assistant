import { Router } from 'express'
import documentController from '../controllers/document.controller.js'
import searchController from '../controllers/search.controller.js'
import upload from '../middlewares/upload.middleware.js'

const appRouter = Router()

appRouter.post('/document', upload.single('file'), documentController.handleDocument)
appRouter.get('/search', searchController.handleSearch)

export default appRouter