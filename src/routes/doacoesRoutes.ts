import { Router } from 'express'
import {
  criarDoacao,
  listarDoacoes,
  minhasDoacoes,
  buscarDoacao,
  atualizarStatus,
  concluirDoacao,
  euQuero,
  removerEuQuero,
  meusEuQuero,
  historico,
} from '../controllers/doacoesController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.post('/', criarDoacao)
router.get('/', listarDoacoes)
router.get('/minhas', minhasDoacoes)
router.get('/eu-quero', meusEuQuero)
router.get('/historico', historico)
router.get('/:id', buscarDoacao)
router.patch('/:id/status', atualizarStatus)
router.post('/:id/concluir', concluirDoacao)
router.post('/:id/eu-quero', euQuero)
router.delete('/:id/eu-quero', removerEuQuero)

export default router
