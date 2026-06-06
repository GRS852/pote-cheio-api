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
} from '../controllers/donationsController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.use(authMiddleware)

router.post('/', createDonation)
router.get('/', listDonations)
router.get('/mine', myDonations)
router.get('/wishlist', myWishlist)
router.get('/:id', getDonation)
router.patch('/:id/status', updateStatus)
router.post('/:id/complete', completeDonation)
router.post('/:id/wishlist', addToWishlist)
router.delete('/:id/wishlist', removeFromWishlist)

export default router
