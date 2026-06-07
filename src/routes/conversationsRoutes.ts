import { Router } from 'express'
import {
  createConversation,
  listConversations,
  listMessages,
  hideConversation,
} from '../controllers/conversationsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createConversation)
router.get('/', listConversations)
router.get('/:id/messages', listMessages)
router.patch('/:id/hide', hideConversation)

export default router
