import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function listNotifications(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.userId]
    )

    const unread = rows.filter((n) => !n.read).length

    return res.status(200).json({ notifications: rows, unread })
  } catch (error) {
    console.error('List notifications error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function markAsRead(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    )

    return res.status(200).json({ message: 'Notification marked as read' })
  } catch (error) {
    console.error('Mark as read error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function markAllAsRead(req: AuthRequest, res: Response) {
  try {
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE user_id = $1 AND read = FALSE`,
      [req.userId]
    )

    return res.status(200).json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('Mark all as read error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
