import { Router } from 'express'
import { criarConversa, listarConversas, listarMensagens } from '../controllers/conversasController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.post('/', criarConversa)
router.get('/', listarConversas)
router.get('/:id/mensagens', listarMensagens)

export default router
