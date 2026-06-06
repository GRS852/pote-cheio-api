import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { criarNotificacao } from '../services/notificacoesService'

export async function criarDoacao(req: AuthRequest, res: Response) {
  const { titulo, descricao, categoria, foto_url, quantidade } = req.body
  const usuario_id = req.usuarioId

  try {
    const { rows } = await pool.query(
      `INSERT INTO doacoes (usuario_id, titulo, descricao, categoria, foto_url, quantidade)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [usuario_id, titulo, descricao, categoria, foto_url, quantidade ?? 1]
    )

    return res.status(201).json({ doacao: rows[0] })
  } catch (error) {
    console.error('Erro ao criar doação:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function listarDoacoes(req: AuthRequest, res: Response) {
  const { categoria } = req.query

  try {
    const params: unknown[] = []
    let where = `WHERE d.status = 'disponivel'`

    if (categoria) {
      params.push(categoria)
      where += ` AND d.categoria = $${params.length}`
    }

    const { rows } = await pool.query(
      `SELECT d.*, c.nome_completo AS doador_nome
       FROM doacoes d
       JOIN clientes c ON c.usuario_id = d.usuario_id
       ${where}
       ORDER BY d.criado_em DESC`,
      params
    )

    return res.status(200).json({ doacoes: rows })
  } catch (error) {
    console.error('Erro ao listar doações:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function minhasDoacoes(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM doacoes WHERE usuario_id = $1 ORDER BY criado_em DESC`,
      [req.usuarioId]
    )

    return res.status(200).json({ doacoes: rows })
  } catch (error) {
    console.error('Erro ao listar minhas doações:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function buscarDoacao(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.nome_completo AS doador_nome
       FROM doacoes d
       JOIN clientes c ON c.usuario_id = d.usuario_id
       WHERE d.id = $1`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Doação não encontrada' })
    }

    return res.status(200).json({ doacao: rows[0] })
  } catch (error) {
    console.error('Erro ao buscar doação:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function atualizarStatus(req: AuthRequest, res: Response) {
  const { id } = req.params
  const { status } = req.body

  try {
    const doacao = await pool.query(
      `SELECT id, usuario_id FROM doacoes WHERE id = $1`,
      [id]
    )

    if (doacao.rows.length === 0) {
      return res.status(404).json({ error: 'Doação não encontrada' })
    }

    if (doacao.rows[0].usuario_id !== req.usuarioId) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta doação' })
    }

    const { rows } = await pool.query(
      `UPDATE doacoes SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    )

    return res.status(200).json({ doacao: rows[0] })
  } catch (error) {
    console.error('Erro ao atualizar status:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function concluirDoacao(req: AuthRequest, res: Response) {
  const { id } = req.params
  const { usuario_receptor_id } = req.body

  try {
    const doacao = await pool.query(
      `SELECT id, usuario_id FROM doacoes WHERE id = $1`,
      [id]
    )

    if (doacao.rows.length === 0) {
      return res.status(404).json({ error: 'Doação não encontrada' })
    }

    if (doacao.rows[0].usuario_id !== req.usuarioId) {
      return res.status(403).json({ error: 'Sem permissão para concluir esta doação' })
    }

    await pool.query(
      `UPDATE doacoes SET status = 'concluida' WHERE id = $1`,
      [id]
    )

    await pool.query(
      `INSERT INTO historico_doacoes (doacao_id, usuario_doador_id, usuario_receptor_id)
       VALUES ($1, $2, $3)`,
      [id, req.usuarioId, usuario_receptor_id]
    )

    return res.status(200).json({ message: 'Doação concluída com sucesso' })
  } catch (error) {
    console.error('Erro ao concluir doação:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function euQuero(req: AuthRequest, res: Response) {
  const { id: doacao_id } = req.params
  const usuario_id = req.usuarioId

  try {
    const doacao = await pool.query(
      `SELECT id, usuario_id, titulo FROM doacoes WHERE id = $1 AND status = 'disponivel'`,
      [doacao_id]
    )

    if (doacao.rows.length === 0) {
      return res.status(404).json({ error: 'Doação não encontrada ou indisponível' })
    }

    if (doacao.rows[0].usuario_id === usuario_id) {
      return res.status(400).json({ error: 'Você não pode querer sua própria doação' })
    }

    await pool.query(
      `INSERT INTO eu_quero (doacao_id, usuario_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [doacao_id, usuario_id]
    )

    // Abre ou retorna a conversa com o doador
    const existente = await pool.query(
      `SELECT id FROM conversas WHERE doacao_id = $1 AND usuario_remetente_id = $2`,
      [doacao_id, usuario_id]
    )

    let conversa_id: number

    if (existente.rows.length > 0) {
      conversa_id = existente.rows[0].id
    } else {
      const nova = await pool.query(
        `INSERT INTO conversas (doacao_id, usuario_remetente_id, usuario_destinatario_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [doacao_id, usuario_id, doacao.rows[0].usuario_id]
      )
      conversa_id = nova.rows[0].id

      await criarNotificacao({
        usuario_id: doacao.rows[0].usuario_id,
        tipo: 'eu_quero',
        titulo: 'Alguém quer sua doação!',
        mensagem: `Um usuário demonstrou interesse em "${doacao.rows[0].titulo}".`,
        referencia_id: conversa_id,
        referencia_tipo: 'conversa',
      })
    }

    return res.status(201).json({ conversa_id })
  } catch (error) {
    console.error('Erro ao registrar eu quero:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function removerEuQuero(req: AuthRequest, res: Response) {
  const { id: doacao_id } = req.params

  try {
    await pool.query(
      `DELETE FROM eu_quero WHERE doacao_id = $1 AND usuario_id = $2`,
      [doacao_id, req.usuarioId]
    )

    return res.status(200).json({ message: 'Removido com sucesso' })
  } catch (error) {
    console.error('Erro ao remover eu quero:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function meusEuQuero(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.nome_completo AS doador_nome, eq.criado_em AS marcado_em
       FROM eu_quero eq
       JOIN doacoes d ON d.id = eq.doacao_id
       JOIN clientes c ON c.usuario_id = d.usuario_id
       WHERE eq.usuario_id = $1
       ORDER BY eq.criado_em DESC`,
      [req.usuarioId]
    )

    return res.status(200).json({ doacoes: rows })
  } catch (error) {
    console.error('Erro ao listar eu quero:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function historico(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, d.titulo, d.categoria,
              cd.nome_completo AS doador_nome,
              cr.nome_completo AS receptor_nome
       FROM historico_doacoes h
       JOIN doacoes d ON d.id = h.doacao_id
       JOIN clientes cd ON cd.usuario_id = h.usuario_doador_id
       JOIN clientes cr ON cr.usuario_id = h.usuario_receptor_id
       WHERE h.usuario_doador_id = $1 OR h.usuario_receptor_id = $1
       ORDER BY h.data_doacao DESC`,
      [req.usuarioId]
    )

    return res.status(200).json({ historico: rows })
  } catch (error) {
    console.error('Erro ao buscar histórico:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
