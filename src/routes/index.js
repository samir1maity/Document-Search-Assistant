import { Router } from 'express'
import documentController from '../controllers/document.controller.js'
import upload from '../middlewares/upload.middleware.js'

const appRouter = Router()

appRouter.post('/document', upload.single('file'), documentController.handleDocument)

export default appRouter