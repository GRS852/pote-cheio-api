import { Router } from 'express'
import { feed } from '../controllers/feedController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.get('/', authMiddleware, feed)

export default router
