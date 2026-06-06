import { Router } from 'express'
import { doacoesFeitas, doacoesRecebidas } from '../controllers/historicoController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.get('/feitas', doacoesFeitas)
router.get('/recebidas', doacoesRecebidas)

export default router
