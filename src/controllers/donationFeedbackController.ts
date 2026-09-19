import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

const MAX_COMMENT_PHOTOS = 3
const DUPLICATE_KEY_ERROR = '23505'

async function findFinalizedTransactionForRecipient(donationId: string | string[], recipientId: number) {
  const { rows } = await pool.query(
    `SELECT * FROM donation_history
     WHERE donation_id = $1 AND recipient_id = $2 AND status LIKE 'finalized_%'
     ORDER BY id DESC LIMIT 1`,
    [donationId, recipientId]
  )
  return rows[0] ?? null
}

export async function createRating(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params
  const rating = Number(req.body.rating)

  if (!Number.isFinite(rating) || rating < 0 || rating > 5 || Math.round(rating * 2) !== rating * 2) {
    return res.status(400).json({ error: 'rating deve ser um número de 0 a 5, em passos de 0.5' })
  }

  try {
    const transaction = await findFinalizedTransactionForRecipient(donation_id, req.userId as number)
    if (!transaction) {
      return res.status(400).json({ error: 'Só é possível avaliar depois que a doação for finalizada' })
    }

    const { rows } = await pool.query(
      `INSERT INTO donation_ratings (donation_history_id, donation_id, donor_id, recipient_id, rating)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [transaction.id, donation_id, transaction.donor_id, transaction.recipient_id, rating]
    )

    return res.status(201).json({ rating: rows[0] })
  } catch (error: any) {
    if (error?.code === DUPLICATE_KEY_ERROR) {
      return res.status(409).json({ error: 'Você já avaliou essa doação' })
    }
    console.error('Create rating error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function createComment(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params
  const { comment } = req.body
  const photo_urls: string[] = Array.isArray(req.body.photo_urls)
    ? req.body.photo_urls.filter((url: unknown) => typeof url === 'string' && url.length > 0).slice(0, MAX_COMMENT_PHOTOS)
    : []

  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    return res.status(400).json({ error: 'comment é obrigatório' })
  }

  try {
    const transaction = await findFinalizedTransactionForRecipient(donation_id, req.userId as number)
    if (!transaction) {
      return res.status(400).json({ error: 'Só é possível comentar depois que a doação for finalizada' })
    }

    const { rows } = await pool.query(
      `INSERT INTO donation_comments (donation_history_id, donation_id, donor_id, recipient_id, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [transaction.id, donation_id, transaction.donor_id, transaction.recipient_id, comment.trim()]
    )
    const insertedComment = rows[0]

    for (let position = 0; position < photo_urls.length; position++) {
      await pool.query(
        `INSERT INTO donation_comment_photos (comment_id, photo_url, position) VALUES ($1, $2, $3)`,
        [insertedComment.id, photo_urls[position], position]
      )
    }

    insertedComment.photos = photo_urls

    return res.status(201).json({ comment: insertedComment })
  } catch (error: any) {
    if (error?.code === DUPLICATE_KEY_ERROR) {
      return res.status(409).json({ error: 'Você já comentou essa doação' })
    }
    console.error('Create comment error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getUserRatingSummary(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(rating), 1) AS average, COUNT(*)::int AS count
       FROM donation_ratings WHERE donor_id = $1`,
      [id]
    )

    return res.status(200).json({
      average: rows[0].average !== null ? Number(rows[0].average) : null,
      count: rows[0].count,
    })
  } catch (error) {
    console.error('Get user rating summary error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getUserFeedback(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT c.*, d.title AS donation_title, p.full_name AS recipient_name
       FROM donation_comments c
       JOIN donations d ON d.id = c.donation_id
       JOIN profiles p ON p.user_id = c.recipient_id
       WHERE c.donor_id = $1
       ORDER BY c.created_at DESC`,
      [id]
    )

    const photos = await pool.query(
      `SELECT comment_id, photo_url FROM donation_comment_photos
       WHERE comment_id = ANY($1::int[]) ORDER BY position ASC`,
      [rows.map(row => row.id)]
    )

    const photosByComment = new Map<number, string[]>()
    for (const photo of photos.rows) {
      const list = photosByComment.get(photo.comment_id) ?? []
      list.push(photo.photo_url)
      photosByComment.set(photo.comment_id, list)
    }

    const feedback = rows.map(row => ({ ...row, photos: photosByComment.get(row.id) ?? [] }))

    return res.status(200).json({ feedback })
  } catch (error) {
    console.error('Get user feedback error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
