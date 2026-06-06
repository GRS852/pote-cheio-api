import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function doacoesFeitas(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, d.titulo, d.categoria, d.foto_url,
              cr.nome_completo AS receptor_nome
       FROM historico_doacoes h
       JOIN doacoes d ON d.id = h.doacao_id
       JOIN clientes cr ON cr.usuario_id = h.usuario_receptor_id
       WHERE h.usuario_doador_id = $1
       ORDER BY h.data_doacao DESC`,
      [req.usuarioId]
    )

    return res.status(200).json({ historico: rows })
  } catch (error) {
    console.error('Erro ao buscar doações feitas:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function doacoesRecebidas(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, d.titulo, d.categoria, d.foto_url,
              cd.nome_completo AS doador_nome
       FROM historico_doacoes h
       JOIN doacoes d ON d.id = h.doacao_id
       JOIN clientes cd ON cd.usuario_id = h.usuario_doador_id
       WHERE h.usuario_receptor_id = $1
       ORDER BY h.data_doacao DESC`,
      [req.usuarioId]
    )

    return res.status(200).json({ historico: rows })
  } catch (error) {
    console.error('Erro ao buscar doações recebidas:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
