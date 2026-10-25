import pool from '../db'

export type AccountBlock =
  | { status: 401; body: { error: string } }
  | { status: 403; body: { error: string; banned_until?: string } }

// Conta desativada, banida ou removida não pode usar a API, mesmo com um
// token ainda válido (antes isso só era checado no login e em /auth/me).
// Mesmas respostas do login, para o app saber mostrar o motivo.
export async function getAccountBlock(userId: number): Promise<AccountBlock | null> {
  const { rows } = await pool.query(`SELECT status, banned_until FROM users WHERE id = $1`, [userId])
  const user = rows[0]
  if (!user) return { status: 401, body: { error: 'Invalid or expired token' } }
  if (user.status === 'disabled') return { status: 403, body: { error: 'Account disabled' } }
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    return { status: 403, body: { error: 'Account temporarily banned', banned_until: user.banned_until } }
  }
  return null
}
