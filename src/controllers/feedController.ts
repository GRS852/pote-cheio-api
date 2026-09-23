import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function feed(req: AuthRequest, res: Response) {
  const { category, search, page = '1', limit = '20' } = req.query
  const userId = req.userId ?? null

  const pageNum = Math.max(1, parseInt(page as string))
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)))
  const offset = (pageNum - 1) * limitNum

  // filterParams alimenta só a cláusula WHERE (compartilhada pelas duas
  // queries abaixo). userId/limit/offset são parâmetros à parte, usados
  // só na query principal — misturar os dois arrays foi o que quebrou o
  // feed quando o filtro de auto-exclusão (que usava $1) saiu do WHERE.
  const filterParams: unknown[] = []
  // O próprio usuário continua vendo suas doações no feed (com a tag "Sua
  // publicação" no app) — só não pode favoritar/pedir a própria doação,
  // o que já é bloqueado em addToWishlist.
  const filters: string[] = [`d.status = 'available'`]

  if (category) {
    filterParams.push(category)
    filters.push(`d.category = $${filterParams.length}`)
  }

  if (search) {
    filterParams.push(`%${search}%`)
    filters.push(`(d.title ILIKE $${filterParams.length} OR d.description ILIKE $${filterParams.length})`)
  }

  const where = filters.join(' AND ')

  const userIdParam = filterParams.length + 1
  const limitParam = filterParams.length + 2
  const offsetParam = filterParams.length + 3
  const mainParams = [...filterParams, userId, limitNum, offset]

  try {
    const { rows } = await pool.query(
      `SELECT
         d.*,
         d.user_id AS donor_id,
         p.full_name AS donor_name,
         u.avatar_url AS donor_avatar_url,
         EXISTS (
           SELECT 1 FROM wishlist w
           WHERE w.donation_id = d.id AND w.user_id = $${userIdParam}
         ) AS in_wishlist
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       JOIN users u ON u.id = d.user_id
       WHERE ${where}
       ORDER BY d.created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      mainParams
    )

    const total = await pool.query(
      `SELECT COUNT(*) FROM donations d WHERE ${where}`,
      filterParams
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
