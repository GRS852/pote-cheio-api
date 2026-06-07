import { Router } from 'express'
import {
  login,
  register,
  getMe,
  updateProfile,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} from '../controllers/authController'
import { authMiddleware } from '../middlewares/authMiddleware'

const router = Router()

router.post('/login', login)
router.post('/register', register)
router.get('/me', authMiddleware, getMe)
router.patch('/profile', authMiddleware, updateProfile)
router.post('/forgot-password', forgotPassword)
router.post('/verify-reset-code', verifyResetCode)
router.post('/reset-password', resetPassword)

export default router
