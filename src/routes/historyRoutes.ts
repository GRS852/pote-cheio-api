import { Router } from 'express'
import { donationsMade, donationsReceived } from '../controllers/historyController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.get('/made', donationsMade)
router.get('/received', donationsReceived)

export default router
