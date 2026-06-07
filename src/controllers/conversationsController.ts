import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function createConversation(req: AuthRequest, res: Response) {
  const { donation_id, recipient_id } = req.body
  const sender_id = req.userId

  try {
    const existing = await pool.query(
      `SELECT id FROM conversations
       WHERE donation_id = $1 AND sender_id = $2 AND recipient_id = $3`,
      [donation_id, sender_id, recipient_id]
    )

    if (existing.rows.length > 0) {
      return res.status(200).json({ conversation: existing.rows[0] })
    }

    const { rows } = await pool.query(
      `INSERT INTO conversations (donation_id, sender_id, recipient_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [donation_id, sender_id, recipient_id]
    )

    return res.status(201).json({ conversation: rows[0] })
  } catch (error) {
    console.error('Create conversation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function listConversations(req: AuthRequest, res: Response) {
  const userId = req.userId

  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              ps.full_name AS sender_name,
              pr.full_name AS recipient_name
       FROM conversations c
       JOIN users us ON us.id = c.sender_id
       LEFT JOIN profiles ps ON ps.user_id = us.id
       JOIN users ur ON ur.id = c.recipient_id
       LEFT JOIN profiles pr ON pr.user_id = ur.id
       WHERE (c.sender_id = $1 OR c.recipient_id = $1)
         AND NOT EXISTS (
           SELECT 1 FROM conversation_hidden ch
           WHERE ch.conversation_id = c.id AND ch.user_id = $1
         )
       ORDER BY c.created_at DESC`,
      [userId]
    )

    return res.status(200).json({ conversations: rows })
  } catch (error) {
    console.error('List conversations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function listMessages(req: AuthRequest, res: Response) {
  const { id } = req.params
  const userId = req.userId

  try {
    const conversation = await pool.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
      [id, userId]
    )

    if (conversation.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const { rows } = await pool.query(
      `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY sent_at ASC`,
      [id]
    )

    return res.status(200).json({ messages: rows })
  } catch (error) {
    console.error('List messages error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function hideConversation(req: AuthRequest, res: Response) {
  const { id: conversation_id } = req.params
  const userId = req.userId

  try {
    const access = await pool.query(
      `SELECT id FROM conversations
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
      [conversation_id, userId]
    )

    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' })
    }

    await pool.query(
      `INSERT INTO conversation_hidden (user_id, conversation_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, conversation_id]
    )

    return res.status(200).json({ message: 'Conversa removida' })
  } catch (error) {
    console.error('Hide conversation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
