import { Router } from 'express'
import { adminLogin } from '../controllers/adminAuthController'
import { listReports, getReport, updateReportStatus } from '../controllers/reportsController'
import {
  getUserActivity,
  getConversationMessages,
  warnUser,
  disableUser,
  reactivateUser,
  listDisabledAccounts,
  getStats,
} from '../controllers/adminController'
import { adminAuthMiddleware } from '../middlewares/adminAuthMiddleware'

const router = Router()

router.post('/login', adminLogin)

router.get('/stats', adminAuthMiddleware, getStats)

router.get('/reports', adminAuthMiddleware, listReports)
router.get('/reports/:id', adminAuthMiddleware, getReport)
router.patch('/reports/:id', adminAuthMiddleware, updateReportStatus)

router.get('/accounts/disabled', adminAuthMiddleware, listDisabledAccounts)

router.get('/users/:id', adminAuthMiddleware, getUserActivity)
router.post('/users/:id/warn', adminAuthMiddleware, warnUser)
router.post('/users/:id/disable', adminAuthMiddleware, disableUser)
router.post('/users/:id/reactivate', adminAuthMiddleware, reactivateUser)

router.get('/conversations/:id/messages', adminAuthMiddleware, getConversationMessages)

export default router
