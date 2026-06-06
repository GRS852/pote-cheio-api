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

const router = Router()

router.use(authMiddleware)

router.post('/', createDonation)
router.get('/', listDonations)
router.get('/mine', myDonations)
router.get('/wishlist', myWishlist)
router.get('/:id', getDonation)
router.delete('/:id', deleteDonation)
router.patch('/:id/status', updateStatus)
router.patch('/:id/confirm', confirmDonation)
router.post('/:id/complete', completeDonation)
router.get('/:id/interested', getInterestedUsers)
router.post('/:id/wishlist', addToWishlist)
router.delete('/:id/wishlist', removeFromWishlist)

export default router
