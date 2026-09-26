import { Response } from 'express'
import pool from '../db'
import { AdminAuthRequest } from '../middlewares/adminAuthMiddleware'

export async function getUserActivity(req: AdminAuthRequest, res: Response) {
  const { id } = req.params

  try {
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.avatar_url, u.created_at, u.status, u.disabled_at, u.banned_until,
              p.full_name, p.birth_date, p.phone, p.cpf
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [id]
    )

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' })

    const [donations, wishlist, history, conversations, reportsMade, reportsAgainst, moderationHistory] = await Promise.all([
      pool.query('SELECT * FROM donations WHERE user_id = $1 ORDER BY created_at DESC', [id]),
      pool.query(
        `SELECT w.*, d.title, d.status AS donation_status
         FROM wishlist w JOIN donations d ON d.id = w.donation_id
         WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT h.*, d.title
         FROM donation_history h JOIN donations d ON d.id = h.donation_id
         WHERE h.donor_id = $1 OR h.recipient_id = $1
         ORDER BY h.donated_at DESC`,
        [id]
      ),
      pool.query(
        `SELECT c.*,
                ps.full_name AS sender_name, pr.full_name AS recipient_name,
                d.title AS donation_title
         FROM conversations c
         JOIN users us ON us.id = c.sender_id
         LEFT JOIN profiles ps ON ps.user_id = us.id
         JOIN users ur ON ur.id = c.recipient_id
         LEFT JOIN profiles pr ON pr.user_id = ur.id
         LEFT JOIN donations d ON d.id = c.donation_id
         WHERE c.sender_id = $1 OR c.recipient_id = $1
         ORDER BY c.created_at DESC`,
        [id]
      ),
      pool.query('SELECT * FROM reports WHERE reporter_id = $1 ORDER BY created_at DESC', [id]),
      pool.query('SELECT * FROM reports WHERE reported_user_id = $1 ORDER BY created_at DESC', [id]),
      pool.query(
        `SELECT ma.*, a.full_name AS admin_name
         FROM moderation_actions ma JOIN admins a ON a.id = ma.admin_id
         WHERE ma.user_id = $1 ORDER BY ma.created_at DESC`,
        [id]
      ),
    ])

    const warningCount = moderationHistory.rows.filter(a => a.action_type === 'warning').length

    return res.status(200).json({
      user: userResult.rows[0],
      donations: donations.rows,
      wishlist: wishlist.rows,
      donation_history: history.rows,
      conversations: conversations.rows,
      reports_made: reportsMade.rows,
      reports_against: reportsAgainst.rows,
      moderation_history: moderationHistory.rows,
      warning_count: warningCount,
    })
  } catch (error) {
    console.error('Get user activity error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Se a ação de moderação vier amarrada a uma denúncia, respeita a mesma trava
// de job usada em updateReportStatus: só quem está "em análise" nela pode agir.
async function checkReportLock(reportId: number, adminId: number): Promise<string | null> {
  const result = await pool.query('SELECT assigned_admin_id FROM reports WHERE id = $1', [reportId])
  if (result.rows.length === 0) return 'Report not found'
  const assignee = result.rows[0].assigned_admin_id
  if (assignee && assignee !== adminId) return 'Report is locked by another administrator'
  return null
}

export async function warnUser(req: AdminAuthRequest, res: Response) {
  const { id } = req.params
  const { ban_days, reason, report_id } = req.body

  const banDays = Number(ban_days)
  if (!Number.isFinite(banDays) || banDays < 0) {
    return res.status(400).json({ error: 'ban_days must be a non-negative number' })
  }

  try {
    if (report_id) {
      const lockError = await checkReportLock(Number(report_id), req.adminId as number)
      if (lockError === 'Report not found') return res.status(404).json({ error: lockError })
      if (lockError) return res.status(409).json({ error: lockError })
    }

    const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [id])
    if (userExists.rows.length === 0) return res.status(404).json({ error: 'User not found' })

    await pool.query(
      `INSERT INTO moderation_actions (user_id, admin_id, report_id, action_type, ban_days, reason)
       VALUES ($1, $2, $3, 'warning', $4, $5)`,
      [id, req.adminId, report_id ?? null, banDays, reason ?? null]
    )

    const { rows } = await pool.query(
      `UPDATE users
       SET banned_until = CASE WHEN $1 > 0 THEN CURRENT_TIMESTAMP + ($1 || ' days')::interval ELSE banned_until END
       WHERE id = $2
       RETURNING id, status, banned_until`,
      [banDays, id]
    )

    const warningCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM moderation_actions WHERE user_id = $1 AND action_type = 'warning'`,
      [id]
    )

    return res.status(200).json({ user: rows[0], warning_count: warningCount.rows[0].count })
  } catch (error) {
    console.error('Warn user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function disableUser(req: AdminAuthRequest, res: Response) {
  const { id } = req.params
  const { reason, report_id } = req.body

  try {
    if (report_id) {
      const lockError = await checkReportLock(Number(report_id), req.adminId as number)
      if (lockError === 'Report not found') return res.status(404).json({ error: lockError })
      if (lockError) return res.status(409).json({ error: lockError })
    }

    const { rows } = await pool.query(
      `UPDATE users SET status = 'disabled', disabled_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING id, status, disabled_at`,
      [id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' })

    await pool.query(
      `INSERT INTO moderation_actions (user_id, admin_id, report_id, action_type, reason)
       VALUES ($1, $2, $3, 'disable_account', $4)`,
      [id, req.adminId, report_id ?? null, reason ?? null]
    )

    return res.status(200).json({ user: rows[0] })
  } catch (error) {
    console.error('Disable user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function reactivateUser(req: AdminAuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `UPDATE users SET status = 'active', disabled_at = NULL
       WHERE id = $1 RETURNING id, status`,
      [id]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' })

    await pool.query(
      `INSERT INTO moderation_actions (user_id, admin_id, action_type)
       VALUES ($1, $2, 'reactivate_account')`,
      [id, req.adminId]
    )

    return res.status(200).json({ user: rows[0] })
  } catch (error) {
    console.error('Reactivate user error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const ACCOUNT_DELETION_GRACE_DAYS = 30

export async function listDisabledAccounts(req: AdminAuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.disabled_at, p.full_name,
              GREATEST(0, ${ACCOUNT_DELETION_GRACE_DAYS} - EXTRACT(DAY FROM CURRENT_TIMESTAMP - u.disabled_at))::int AS days_remaining,
              (
                SELECT ma.reason FROM moderation_actions ma
                WHERE ma.user_id = u.id AND ma.action_type = 'disable_account'
                ORDER BY ma.created_at DESC LIMIT 1
              ) AS disable_reason,
              (
                SELECT COUNT(*)::int FROM moderation_actions ma
                WHERE ma.user_id = u.id AND ma.action_type = 'warning' AND COALESCE(ma.ban_days, 0) = 0
              ) AS warning_count,
              (
                SELECT COUNT(*)::int FROM moderation_actions ma
                WHERE ma.user_id = u.id AND ma.action_type = 'warning' AND ma.ban_days > 0
              ) AS suspension_count
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.status = 'disabled'
       ORDER BY u.disabled_at ASC`
    )
    return res.status(200).json({ accounts: rows, grace_period_days: ACCOUNT_DELETION_GRACE_DAYS })
  } catch (error) {
    console.error('List disabled accounts error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getStats(req: AdminAuthRequest, res: Response) {
  try {
    const [users, recentUsers, reportCounts, disabledAccounts] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE status = 'active'`),
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_TIMESTAMP - interval '7 days'`),
      pool.query(`SELECT status, COUNT(*)::int AS count FROM reports GROUP BY status`),
      pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE status = 'disabled'`),
    ])

    const reportsByStatus: Record<string, number> = { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 }
    for (const row of reportCounts.rows) reportsByStatus[row.status] = row.count

    return res.status(200).json({
      active_accounts: users.rows[0].count,
      recent_accounts: recentUsers.rows[0].count,
      disabled_accounts: disabledAccounts.rows[0].count,
      reports: reportsByStatus,
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function purgeExpiredAccounts(): Promise<void> {
  try {
    const result = await pool.query(
      `DELETE FROM users WHERE status = 'disabled' AND disabled_at < CURRENT_TIMESTAMP - interval '${ACCOUNT_DELETION_GRACE_DAYS} days'`
    )
    if (result.rowCount) console.log(`[purgeExpiredAccounts] Removed ${result.rowCount} account(s) past the grace period`)
  } catch (error) {
    console.error('Purge expired accounts error:', error)
  }
}

export async function getConversationMessages(req: AdminAuthRequest, res: Response) {
  const { id } = req.params

  try {
    const conversation = await pool.query(
      `SELECT c.*,
              ps.full_name AS sender_name, pr.full_name AS recipient_name,
              d.title AS donation_title
       FROM conversations c
       JOIN users us ON us.id = c.sender_id
       LEFT JOIN profiles ps ON ps.user_id = us.id
       JOIN users ur ON ur.id = c.recipient_id
       LEFT JOIN profiles pr ON pr.user_id = ur.id
       LEFT JOIN donations d ON d.id = c.donation_id
       WHERE c.id = $1`,
      [id]
    )

    if (conversation.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' })

    const messages = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC',
      [id]
    )

    return res.status(200).json({ conversation: conversation.rows[0], messages: messages.rows })
  } catch (error) {
    console.error('Get conversation messages error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
