import pool from '../db'
import { getIo } from '../socket'

// Campos de uma mensagem como o app recebe: os marcadores de assunto
// ('topic') trazem junto a doação (título, foto e status atual).
export const MESSAGE_SELECT = `
  SELECT m.id, m.conversation_id, m.author_id, m.content, m.sent_at, m.type, m.donation_id,
         d.title AS donation_title, d.photo_url AS donation_photo_url, d.status AS donation_status
  FROM messages m
  LEFT JOIN donations d ON m.type = 'topic' AND d.id = m.donation_id`

// Uma única conversa por dupla de usuários, não importa quem iniciou.
// Cria se ainda não existir (donation_id = assunto que deu origem).
export async function findOrCreatePairConversation(starterId: number, otherId: number, donationId: number): Promise<number> {
  const findPair = () => pool.query(
    `SELECT id FROM conversations
     WHERE LEAST(sender_id, recipient_id) = LEAST($1::int, $2::int)
       AND GREATEST(sender_id, recipient_id) = GREATEST($1::int, $2::int)`,
    [starterId, otherId]
  )

  const existing = await findPair()
  if (existing.rows[0]) return existing.rows[0].id

  const inserted = await pool.query(
    `INSERT INTO conversations (donation_id, sender_id, recipient_id)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id`,
    [donationId, starterId, otherId]
  )
  if (inserted.rows[0]) return inserted.rows[0].id

  // Duas requisições ao mesmo tempo: a outra criou primeiro (índice único da dupla)
  const created = await findPair()
  return created.rows[0].id
}

// Envia uma mensagem (texto ou marcador) em tempo real para os dois participantes
export async function emitConversationMessage(conversationId: number, message: Record<string, unknown>) {
  const io = getIo()
  if (!io) return
  const { rows } = await pool.query(
    `SELECT sender_id, recipient_id FROM conversations WHERE id = $1`,
    [conversationId]
  )
  if (!rows[0]) return
  io.to([`user_${rows[0].sender_id}`, `user_${rows[0].recipient_id}`]).emit('new_message', message)
}

// Abre um novo assunto (doação) na conversa da dupla. Não repete o marcador
// se essa doação já é um assunto da conversa. Devolve true se criou.
export async function addConversationTopic(conversationId: number, donationId: number, authorId: number): Promise<boolean> {
  const inserted = await pool.query(
    `INSERT INTO messages (conversation_id, author_id, content, type, donation_id)
     SELECT $1, $2, d.title, 'topic', d.id FROM donations d
     WHERE d.id = $3
       AND NOT EXISTS (
         SELECT 1 FROM messages m
         WHERE m.conversation_id = $1 AND m.type = 'topic' AND m.donation_id = $3
       )
     RETURNING id`,
    [conversationId, authorId, donationId]
  )
  if (!inserted.rows[0]) return false

  await pool.query(`UPDATE conversations SET donation_id = $1 WHERE id = $2`, [donationId, conversationId])

  const { rows } = await pool.query(`${MESSAGE_SELECT} WHERE m.id = $1`, [inserted.rows[0].id])
  await emitConversationMessage(conversationId, { ...rows[0], client_id: null })
  return true
}
