import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { MESSAGE_SELECT, addConversationTopic, createTextMessage, findOrCreatePairConversation } from '../services/conversationsService'

// Uma conversa por dupla: se já existe conversa entre os dois, reaproveita
// e só abre um novo assunto (a doação) dentro dela.
export async function createConversation(req: AuthRequest, res: Response) {
  const { donation_id, recipient_id } = req.body
  const sender_id = req.userId as number

  if (!donation_id || !recipient_id || Number(recipient_id) === sender_id) {
    return res.status(400).json({ error: 'donation_id and a valid recipient_id are required' })
  }

  try {
    const conversationId = await findOrCreatePairConversation(sender_id, Number(recipient_id), Number(donation_id))
    await addConversationTopic(conversationId, Number(donation_id), sender_id)

    const { rows } = await pool.query(`SELECT * FROM conversations WHERE id = $1`, [conversationId])
    return res.status(200).json({ conversation: rows[0] })
  } catch (error) {
    console.error('Create conversation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Lista de conversas do usuário. Quem limpou uma conversa só volta a vê-la
// quando chega algo novo (mensagem ou assunto) depois do ponto de limpeza.
export async function listConversations(req: AuthRequest, res: Response) {
  const userId = req.userId

  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              ps.full_name AS sender_name,
              pr.full_name AS recipient_name,
              lt.donation_id AS topic_donation_id,
              lt.title AS topic_title,
              (SELECT COUNT(*)::int FROM messages t
               WHERE t.conversation_id = c.id AND t.type = 'topic'
                 AND t.id > COALESCE(ch.cleared_before_message_id, 0)) AS topic_count,
              EXISTS (
                SELECT 1 FROM messages t JOIN donations td ON td.id = t.donation_id
                WHERE t.conversation_id = c.id AND t.type = 'topic' AND td.user_id = $1
              ) AS has_donating,
              EXISTS (
                SELECT 1 FROM messages t JOIN donations td ON td.id = t.donation_id
                WHERE t.conversation_id = c.id AND t.type = 'topic' AND td.user_id <> $1
              ) AS has_receiving,
              lm.content AS last_message,
              lm.type AS last_message_type,
              lm.sent_at AS last_message_at
       FROM conversations c
       JOIN users us ON us.id = c.sender_id
       LEFT JOIN profiles ps ON ps.user_id = us.id
       JOIN users ur ON ur.id = c.recipient_id
       LEFT JOIN profiles pr ON pr.user_id = ur.id
       LEFT JOIN conversation_hidden ch ON ch.conversation_id = c.id AND ch.user_id = $1
       LEFT JOIN LATERAL (
         SELECT t.donation_id, d.title FROM messages t
         JOIN donations d ON d.id = t.donation_id
         WHERE t.conversation_id = c.id AND t.type = 'topic'
           AND t.id > COALESCE(ch.cleared_before_message_id, 0)
         ORDER BY t.sent_at DESC, t.id DESC LIMIT 1
       ) lt ON true
       LEFT JOIN LATERAL (
         SELECT m.content, m.type, m.sent_at FROM messages m
         WHERE m.conversation_id = c.id AND m.id > COALESCE(ch.cleared_before_message_id, 0)
         ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
       ) lm ON true
       WHERE (c.sender_id = $1 OR c.recipient_id = $1)
         AND (ch.user_id IS NULL OR lm.sent_at IS NOT NULL)
       ORDER BY COALESCE(lm.sent_at, c.created_at) DESC`,
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
      `SELECT c.id, COALESCE(ch.cleared_before_message_id, 0) AS cleared_before
       FROM conversations c
       LEFT JOIN conversation_hidden ch ON ch.conversation_id = c.id AND ch.user_id = $2
       WHERE c.id = $1 AND (c.sender_id = $2 OR c.recipient_id = $2)`,
      [id, userId]
    )

    if (conversation.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Só o que veio depois de quando o usuário limpou a conversa (se limpou)
    // e, com ?after=<id>, só as novas (atualização periódica do app)
    const after = Number(req.query.after)
    const fromId = Math.max(conversation.rows[0].cleared_before, Number.isInteger(after) && after > 0 ? after : 0)

    const { rows } = await pool.query(
      `${MESSAGE_SELECT}
       WHERE m.conversation_id = $1 AND m.id > $2
       ORDER BY m.sent_at ASC, m.id ASC`,
      [id, fromId]
    )

    return res.status(200).json({ messages: rows })
  } catch (error) {
    console.error('List messages error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Envio de mensagem por HTTP: usado pelo app quando o socket não está
// conectado (ex.: rede que bloqueia WebSocket). Mesmo efeito do socket.
export async function sendMessage(req: AuthRequest, res: Response) {
  const { id } = req.params
  const { content, client_id, donation_id } = req.body ?? {}

  try {
    const message = await createTextMessage(
      Number(id),
      req.userId as number,
      content,
      typeof client_id === 'string' ? client_id : null,
      donation_id != null ? Number(donation_id) : null
    )
    if (!message) return res.status(400).json({ error: 'Invalid message or conversation' })
    return res.status(201).json({ message })
  } catch (error) {
    console.error('Send message error:', error)
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

    // "Limpar conversa" só para quem pediu: guarda até qual mensagem foi
    // limpa. Nada é apagado (a outra pessoa e a moderação continuam vendo).
    await pool.query(
      `INSERT INTO conversation_hidden (user_id, conversation_id, cleared_before_message_id)
       VALUES ($1, $2, COALESCE((SELECT MAX(id) FROM messages WHERE conversation_id = $2), 0))
       ON CONFLICT (user_id, conversation_id)
       DO UPDATE SET cleared_before_message_id = EXCLUDED.cleared_before_message_id`,
      [userId, conversation_id]
    )

    return res.status(200).json({ message: 'Conversa removida' })
  } catch (error) {
    console.error('Hide conversation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
