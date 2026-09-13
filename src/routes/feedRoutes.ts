import { Router } from 'express'
import { feed } from '../controllers/feedController'
import { optionalAuthMiddleware } from '../middlewares/optionalAuthMiddleware'

const router = Router()

router.get('/', optionalAuthMiddleware, feed)

export default router
