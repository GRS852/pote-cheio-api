import { Router } from 'express'
import { adminLogin } from '../controllers/adminAuthController'
import { listReports, getReport, updateReportStatus } from '../controllers/reportsController'
import { getUserActivity, getConversationMessages } from '../controllers/adminController'
import { adminAuthMiddleware } from '../middlewares/adminAuthMiddleware'

const router = Router()

router.post('/login', adminLogin)

router.get('/reports', adminAuthMiddleware, listReports)
router.get('/reports/:id', adminAuthMiddleware, getReport)
router.patch('/reports/:id', adminAuthMiddleware, updateReportStatus)

router.get('/users/:id', adminAuthMiddleware, getUserActivity)
router.get('/conversations/:id/messages', adminAuthMiddleware, getConversationMessages)

export default router
