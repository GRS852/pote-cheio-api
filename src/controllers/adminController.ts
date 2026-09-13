import { Response } from 'express'
import pool from '../db'
import { AdminAuthRequest } from '../middlewares/adminAuthMiddleware'

export async function getUserActivity(req: AdminAuthRequest, res: Response) {
  const { id } = req.params

  try {
    const userResult = await pool.query(
      `SELECT u.id, u.email, u.avatar_url, u.created_at,
              p.full_name, p.birth_date, p.phone, p.cpf
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [id]
    )

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' })

    const [donations, wishlist, history, conversations, reportsMade, reportsAgainst] = await Promise.all([
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
    ])

    return res.status(200).json({
      user: userResult.rows[0],
      donations: donations.rows,
      wishlist: wishlist.rows,
      donation_history: history.rows,
      conversations: conversations.rows,
      reports_made: reportsMade.rows,
      reports_against: reportsAgainst.rows,
    })
  } catch (error) {
    console.error('Get user activity error:', error)
    return res.status(500).json({ error: 'Internal server error' })
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
