import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { AdminAuthRequest } from '../middlewares/adminAuthMiddleware'

const VALID_REASONS = ['scam', 'inappropriate_content', 'harassment', 'spam']
const VALID_STATUSES = ['pending', 'reviewing', 'resolved', 'dismissed']

export async function createReport(req: AuthRequest, res: Response) {
  const { target_type, donation_id, conversation_id, reason, description } = req.body
  const reporter_id = req.userId

  if (target_type !== 'donation' && target_type !== 'conversation') {
    return res.status(400).json({ error: 'Invalid target_type' })
  }
  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: 'Invalid reason' })
  }

  try {
    let reported_user_id: number | null = null

    if (target_type === 'donation') {
      if (!donation_id) return res.status(400).json({ error: 'donation_id is required' })
      const donation = await pool.query('SELECT user_id FROM donations WHERE id = $1', [donation_id])
      if (donation.rows.length === 0) return res.status(404).json({ error: 'Donation not found' })
      reported_user_id = donation.rows[0].user_id
    } else {
      if (!conversation_id) return res.status(400).json({ error: 'conversation_id is required' })
      const conversation = await pool.query(
        `SELECT sender_id, recipient_id FROM conversations
         WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
        [conversation_id, reporter_id]
      )
      if (conversation.rows.length === 0) return res.status(404).json({ error: 'Conversation not found' })
      const { sender_id, recipient_id } = conversation.rows[0]
      reported_user_id = sender_id === reporter_id ? recipient_id : sender_id
    }

    const { rows } = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, donation_id, conversation_id, reported_user_id, reason, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        reporter_id,
        target_type,
        target_type === 'donation' ? donation_id : null,
        target_type === 'conversation' ? conversation_id : null,
        reported_user_id,
        reason,
        description ?? null,
      ]
    )

    return res.status(201).json({ report: rows[0] })
  } catch (error) {
    console.error('Create report error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function listReports(req: AdminAuthRequest, res: Response) {
  const { status } = req.query

  try {
    const params: unknown[] = []
    let where = ''
    if (status && VALID_STATUSES.includes(status as string)) {
      params.push(status)
      where = `WHERE r.status = $${params.length}`
    }

    const { rows } = await pool.query(
      `SELECT r.*,
              pr.full_name AS reporter_name,
              pu.full_name AS reported_user_name,
              d.title AS donation_title,
              d.photo_url AS donation_photo_url,
              pa.full_name AS assigned_admin_name
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN profiles pr ON pr.user_id = ru.id
       LEFT JOIN users uu ON uu.id = r.reported_user_id
       LEFT JOIN profiles pu ON pu.user_id = uu.id
       LEFT JOIN donations d ON d.id = r.donation_id
       LEFT JOIN admins pa ON pa.id = r.assigned_admin_id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    )

    return res.status(200).json({ reports: rows })
  } catch (error) {
    console.error('List reports error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getReport(req: AdminAuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              pr.full_name AS reporter_name, ru.email AS reporter_email,
              pu.full_name AS reported_user_name, uu.email AS reported_user_email,
              uu.status AS reported_user_status, uu.banned_until,
              pa.full_name AS assigned_admin_name
       FROM reports r
       JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN profiles pr ON pr.user_id = ru.id
       LEFT JOIN users uu ON uu.id = r.reported_user_id
       LEFT JOIN profiles pu ON pu.user_id = uu.id
       LEFT JOIN admins pa ON pa.id = r.assigned_admin_id
       WHERE r.id = $1`,
      [id]
    )

    if (rows.length === 0) return res.status(404).json({ error: 'Report not found' })
    const report = rows[0]

    if (report.reported_user_id) {
      const warnings = await pool.query(
        `SELECT COUNT(*)::int AS count FROM moderation_actions WHERE user_id = $1 AND action_type = 'warning'`,
        [report.reported_user_id]
      )
      report.reported_user_warning_count = warnings.rows[0].count
    }

    if (report.donation_id) {
      const donation = await pool.query('SELECT * FROM donations WHERE id = $1', [report.donation_id])
      report.donation = donation.rows[0] ?? null
    }

    if (report.conversation_id) {
      const messages = await pool.query(
        'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC',
        [report.conversation_id]
      )
      report.messages = messages.rows
    }

    return res.status(200).json({ report })
  } catch (error) {
    console.error('Get report error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function updateReportStatus(req: AdminAuthRequest, res: Response) {
  const { id } = req.params
  const { status } = req.body

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  try {
    const current = await pool.query('SELECT assigned_admin_id FROM reports WHERE id = $1', [id])
    if (current.rows.length === 0) return res.status(404).json({ error: 'Report not found' })

    const currentAssignee = current.rows[0].assigned_admin_id
    if (currentAssignee && currentAssignee !== req.adminId) {
      return res.status(409).json({ error: 'Report is locked by another administrator' })
    }

    // "pending" libera o job; qualquer outro status assume o job pra este admin
    // (trava real: enquanto assigned_admin_id != null e != req.adminId, ninguém mais mexe).
    const resolved = status === 'resolved' || status === 'dismissed'
    const nextAssignee = status === 'pending' ? null : req.adminId

    const { rows } = await pool.query(
      `UPDATE reports
       SET status = $1,
           assigned_admin_id = $2,
           resolved_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,
           resolved_by = CASE WHEN $3 THEN $4 ELSE NULL END
       WHERE id = $5
       RETURNING *`,
      [status, nextAssignee, resolved, req.adminId, id]
    )

    return res.status(200).json({ report: rows[0] })
  } catch (error) {
    console.error('Update report error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
