import { Router } from 'express'
import { getUserRatingSummary, getUserFeedback } from '../controllers/donationFeedbackController'

const router = Router()

// Público: quem visita o perfil de um doador (mesmo sem login) vê a nota média
// e os comentários deixados por quem já recebeu doações dele.
router.get('/:id/rating-summary', getUserRatingSummary)
router.get('/:id/feedback', getUserFeedback)

export default router
