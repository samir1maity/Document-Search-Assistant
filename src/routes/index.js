import { Router } from 'express'
import documentController from '../controllers/document.controller'

const appRouter = Router()

appRouter.get('/', documentController.documentController)