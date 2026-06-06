import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function criarConversa(req: AuthRequest, res: Response) {
  const { doacao_id, usuario_destinatario_id } = req.body
  const usuario_remetente_id = req.usuarioId

  try {
    const existente = await pool.query(
      `SELECT id FROM conversas
       WHERE doacao_id = $1
         AND usuario_remetente_id = $2
         AND usuario_destinatario_id = $3`,
      [doacao_id, usuario_remetente_id, usuario_destinatario_id]
    )

    if (existente.rows.length > 0) {
      return res.status(200).json({ conversa: existente.rows[0] })
    }

    const { rows } = await pool.query(
      `INSERT INTO conversas (doacao_id, usuario_remetente_id, usuario_destinatario_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [doacao_id, usuario_remetente_id, usuario_destinatario_id]
    )

    return res.status(201).json({ conversa: rows[0] })
  } catch (error) {
    console.error('Erro ao criar conversa:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function listarConversas(req: AuthRequest, res: Response) {
  const usuarioId = req.usuarioId

  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              r.email AS remetente_email, cr.nome_completo AS remetente_nome,
              d.email AS destinatario_email, cd.nome_completo AS destinatario_nome
       FROM conversas c
       JOIN usuarios_login r ON r.id = c.usuario_remetente_id
       LEFT JOIN clientes cr ON cr.usuario_id = r.id
       JOIN usuarios_login d ON d.id = c.usuario_destinatario_id
       LEFT JOIN clientes cd ON cd.usuario_id = d.id
       WHERE c.usuario_remetente_id = $1 OR c.usuario_destinatario_id = $1
       ORDER BY c.criado_em DESC`,
      [usuarioId]
    )

    return res.status(200).json({ conversas: rows })
  } catch (error) {
    console.error('Erro ao listar conversas:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function listarMensagens(req: AuthRequest, res: Response) {
  const { id } = req.params
  const usuarioId = req.usuarioId

  try {
    const conversa = await pool.query(
      `SELECT id FROM conversas
       WHERE id = $1 AND (usuario_remetente_id = $2 OR usuario_destinatario_id = $2)`,
      [id, usuarioId]
    )

    if (conversa.rows.length === 0) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const { rows } = await pool.query(
      `SELECT * FROM mensagens WHERE conversa_id = $1 ORDER BY enviado_em ASC`,
      [id]
    )

    return res.status(200).json({ mensagens: rows })
  } catch (error) {
    console.error('Erro ao listar mensagens:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
