import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function feed(req: AuthRequest, res: Response) {
  const { category, search, page = '1', limit = '20' } = req.query
  const userId = req.userId

  const pageNum = Math.max(1, parseInt(page as string))
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)))
  const offset = (pageNum - 1) * limitNum

  const params: unknown[] = [userId]
  const filters: string[] = [`d.status = 'available'`, `d.user_id != $1`]

  if (category) {
    params.push(category)
    filters.push(`d.category = $${params.length}`)
  }

  if (search) {
    params.push(`%${search}%`)
    filters.push(`(d.title ILIKE $${params.length} OR d.description ILIKE $${params.length})`)
  }

  const where = filters.join(' AND ')

  params.push(limitNum)
  params.push(offset)

  try {
    const { rows } = await pool.query(
      `SELECT
         d.*,
         p.full_name AS donor_name,
         EXISTS (
           SELECT 1 FROM wishlist w
           WHERE w.donation_id = d.id AND w.user_id = $1
         ) AS in_wishlist
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    const total = await pool.query(
      `SELECT COUNT(*) FROM donations d WHERE ${where}`,
      params.slice(0, params.length - 2)
    )

    return res.status(200).json({
      donations: rows,
      page: pageNum,
      total: parseInt(total.rows[0].count),
      pages: Math.ceil(parseInt(total.rows[0].count) / limitNum),
    })
  } catch (error) {
    console.error('Feed error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
