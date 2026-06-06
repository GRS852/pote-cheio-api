import { Router } from 'express'
import { createConversation, listConversations, listMessages } from '../controllers/conversationsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createConversation)
router.get('/', listConversations)
router.get('/:id/messages', listMessages)

export default router
