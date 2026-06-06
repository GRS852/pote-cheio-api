import { Router } from 'express'
import { listarNotificacoes, marcarComoLida, marcarTodasComoLidas } from '../controllers/notificacoesController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.get('/', listarNotificacoes)
router.patch('/:id/lida', marcarComoLida)
router.patch('/lidas', marcarTodasComoLidas)

export default router
