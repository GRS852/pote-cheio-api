import pool from '../db'
import { getIo } from '../socket'

interface CriarNotificacaoParams {
  usuario_id: number
  tipo: string
  titulo: string
  mensagem: string
  referencia_id?: number
  referencia_tipo?: string
}

export async function criarNotificacao(params: CriarNotificacaoParams) {
  const { usuario_id, tipo, titulo, mensagem, referencia_id, referencia_tipo } = params

  const { rows } = await pool.query(
    `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, referencia_id, referencia_tipo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [usuario_id, tipo, titulo, mensagem, referencia_id ?? null, referencia_tipo ?? null]
  )

  const io = getIo()
  if (io) {
    io.to(`usuario_${usuario_id}`).emit('nova_notificacao', rows[0])
  }

  return rows[0]
}
