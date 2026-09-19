import { Router } from 'express'
import { createReport } from '../controllers/reportsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.post('/', authMiddleware, createReport)

export default router
