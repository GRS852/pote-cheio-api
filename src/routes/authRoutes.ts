import { Router } from 'express'
import {
  login,
  register,
  getMe,
  updateProfile,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  getMyModerationNotices,
  googleLogin,
  acceptTerms,
  deleteMyAccount,
} from '../controllers/authController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.post('/google', googleLogin)
router.get('/me', authMiddleware, getMe)
router.get('/me/moderation', authMiddleware, getMyModerationNotices)
router.patch('/profile', authMiddleware, updateProfile)
router.post('/accept-terms', authMiddleware, acceptTerms)
router.delete('/me', authMiddleware, deleteMyAccount)
router.post('/forgot-password', forgotPassword)
router.post('/verify-reset-code', verifyResetCode)
router.post('/reset-password', resetPassword)

export default router
