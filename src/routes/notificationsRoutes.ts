import { Router } from 'express'
import { listNotifications, markAsRead, markAllAsRead } from '../controllers/notificationsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.get('/', listNotifications)
router.patch('/:id/read', markAsRead)
router.patch('/read-all', markAllAsRead)

export default router
