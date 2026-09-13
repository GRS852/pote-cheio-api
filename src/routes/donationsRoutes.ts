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

export default router
