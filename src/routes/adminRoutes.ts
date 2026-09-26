import { Router } from 'express'
import { adminLogin } from '../controllers/adminAuthController'
import { listReports, getReport, updateReportStatus, transferReport } from '../controllers/reportsController'
import {
  getUserActivity,
  getConversationMessages,
  warnUser,
  disableUser,
  reactivateUser,
  listDisabledAccounts,
  getStats,
  listAdmins,
} from '../controllers/adminController'
import { adminAuthMiddleware } from '../middlewares/adminAuthMiddleware'

const router = Router()

router.post('/login', adminLogin)

router.get('/stats', adminAuthMiddleware, getStats)
router.get('/admins', adminAuthMiddleware, listAdmins)

router.get('/reports', adminAuthMiddleware, listReports)
router.get('/reports/:id', adminAuthMiddleware, getReport)
router.patch('/reports/:id', adminAuthMiddleware, updateReportStatus)
router.post('/reports/:id/transfer', adminAuthMiddleware, transferReport)

router.get('/accounts/disabled', adminAuthMiddleware, listDisabledAccounts)

router.get('/users/:id', adminAuthMiddleware, getUserActivity)
router.post('/users/:id/warn', adminAuthMiddleware, warnUser)
router.post('/users/:id/disable', adminAuthMiddleware, disableUser)
router.post('/users/:id/reactivate', adminAuthMiddleware, reactivateUser)

router.get('/conversations/:id/messages', adminAuthMiddleware, getConversationMessages)

export default router
