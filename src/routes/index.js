import { Router } from 'express'
import documentController from '../controllers/document.controller.js'

const appRouter = Router()

appRouter.get('/', documentController.handleDocument)

export default appRouter