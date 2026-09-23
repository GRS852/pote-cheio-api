import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

// Público (sem login): nome e avatar básicos de qualquer usuário, para
// exibir em qualquer lugar do site que mencione outro usuário (perfil do
// doador, lista de conversas, balão de chat).
export async function getPublicUserProfile(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT u.id, p.full_name, u.avatar_url
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    return res.status(200).json({ user: rows[0] })
  } catch (error) {
    console.error('Get public user profile error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
