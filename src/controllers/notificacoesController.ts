import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function listarNotificacoes(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM notificacoes
       WHERE usuario_id = $1
       ORDER BY criado_em DESC
       LIMIT 50`,
      [req.usuarioId]
    )

    const naoLidas = rows.filter((n) => !n.lido).length

    return res.status(200).json({ notificacoes: rows, nao_lidas: naoLidas })
  } catch (error) {
    console.error('Erro ao listar notificações:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function marcarComoLida(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    await pool.query(
      `UPDATE notificacoes SET lido = TRUE WHERE id = $1 AND usuario_id = $2`,
      [id, req.usuarioId]
    )

    return res.status(200).json({ message: 'Notificação marcada como lida' })
  } catch (error) {
    console.error('Erro ao marcar notificação:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function marcarTodasComoLidas(req: AuthRequest, res: Response) {
  try {
    await pool.query(
      `UPDATE notificacoes SET lido = TRUE WHERE usuario_id = $1 AND lido = FALSE`,
      [req.usuarioId]
    )

    return res.status(200).json({ message: 'Todas notificações marcadas como lidas' })
  } catch (error) {
    console.error('Erro ao marcar todas notificações:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
