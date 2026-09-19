import { Router } from 'express'
import {
  createDonation,
  listDonations,
  myDonations,
  getDonation,
  updateStatus,
  completeDonation,
  addToWishlist,
  removeFromWishlist,
  myWishlist,
  deleteDonation,
  getInterestedUsers,
  confirmDonation,
} from '../controllers/donationsController'
import {
  getTransaction,
  shipTransaction,
  receiveTransaction,
  donorConfirmReceived,
} from '../controllers/donationTransactionController'
import { createRating, createComment } from '../controllers/donationFeedbackController'
import { authMiddleware } from '../middlewares/authMiddleware'
import { optionalAuthMiddleware } from '../middlewares/optionalAuthMiddleware'

const router = Router()

// Ver o catálogo e o detalhe de uma doação não exige login;
// toda ação (doar, favoritar/"tenho interesse", editar, etc.) continua exigindo.
router.post('/', authMiddleware, createDonation)
router.get('/', authMiddleware, listDonations)
router.get('/mine', authMiddleware, myDonations)
router.get('/wishlist', authMiddleware, myWishlist)
router.get('/:id', optionalAuthMiddleware, getDonation)
router.delete('/:id', authMiddleware, deleteDonation)
router.patch('/:id/status', authMiddleware, updateStatus)
router.patch('/:id/confirm', authMiddleware, confirmDonation)
router.post('/:id/complete', authMiddleware, completeDonation)
router.get('/:id/interested', authMiddleware, getInterestedUsers)
router.post('/:id/wishlist', authMiddleware, addToWishlist)
router.delete('/:id/wishlist', authMiddleware, removeFromWishlist)

// Fluxo de confirmação: aceitar (/:id/confirm, acima) -> enviei -> recebi/confirmo recebimento
router.get('/:id/transaction', authMiddleware, getTransaction)
router.patch('/:id/transaction/ship', authMiddleware, shipTransaction)
router.patch('/:id/transaction/receive', authMiddleware, receiveTransaction)
router.patch('/:id/transaction/donor-confirm-received', authMiddleware, donorConfirmReceived)

// Avaliação e comentário só liberados depois da doação finalizada (checado no controller)
router.post('/:id/rating', authMiddleware, createRating)
router.post('/:id/comment', authMiddleware, createComment)

export default router
