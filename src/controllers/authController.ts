import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { OAuth2Client } from 'google-auth-library'
import { sendPasswordResetEmail } from '../services/emailService'
import { TERMS_VERSION, checkSignupConsent } from '../services/terms'
import { deleteUserAccount } from '../services/accountDeletionService'

// ID do cliente OAuth do Google (é público: também vai no build do site).
// Pode ser trocado pela variável GOOGLE_CLIENT_ID sem mudar o código.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || '172922092574-mq3dutbto5dlqjummop19p57g70j54ab.apps.googleusercontent.com'
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

function signToken(user: { id: number; email: string }) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET as string, { expiresIn: '7d' })
}

// Avisos de moderação do PRÓPRIO usuário logado (nunca exposto em rotas públicas).
export async function getMyModerationNotices(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT ma.id, ma.action_type, ma.ban_days, ma.reason, ma.created_at,
              COALESCE(d.title, rd.title) AS donation_title
       FROM moderation_actions ma
       LEFT JOIN donations d ON d.id = ma.donation_id
       LEFT JOIN reports r ON r.id = ma.report_id
       LEFT JOIN donations rd ON rd.id = r.donation_id
       WHERE ma.user_id = $1 AND ma.action_type IN ('warning', 'remove_post')
       ORDER BY ma.created_at DESC`,
      [req.userId]
    )
    return res.status(200).json({ notices: rows })
  } catch (error) {
    console.error('Get moderation notices error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function register(req: Request, res: Response) {
  const { full_name, email, password, birth_date, accepted_terms } = req.body

  // Aceite dos termos e idade mínima conferidos aqui também (não só na tela)
  const consentError = checkSignupConsent(accepted_terms, birth_date)
  if (consentError) return res.status(400).json({ error: consentError })

  try {
    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    )

    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' })
    }

    const password_hash = await bcrypt.hash(password, 10)

    const { rows } = await pool.query(
      `INSERT INTO users (email, password, terms_accepted_at, terms_version)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3) RETURNING id, email`,
      [email, password_hash, TERMS_VERSION]
    )

    await pool.query(
      'INSERT INTO profiles (user_id, full_name, birth_date) VALUES ($1, $2, $3)',
      [rows[0].id, full_name, birth_date]
    )

    const token = jwt.sign(
      { id: rows[0].id, email: rows[0].email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    )

    return res.status(201).json({ token })
  } catch (error) {
    console.error('Register error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]

    // Conta criada pelo Google ainda não tem senha (pode criar uma pelo "Esqueci minha senha")
    if (!user.password) {
      return res.status(401).json({ error: 'Google account' })
    }

    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Account disabled' })
    }

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ error: 'Account temporarily banned', banned_until: user.banned_until })
    }

    return res.status(200).json({ token: signToken(user) })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.avatar_url, u.created_at, u.status, u.banned_until,
              p.full_name, p.birth_date, p.phone, p.cpf,
              u.terms_accepted_at, u.terms_version,
              (u.terms_version IS DISTINCT FROM $2) AS terms_pending,
              (u.password IS NOT NULL) AS has_password
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.userId, TERMS_VERSION]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const user = result.rows[0]

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Account disabled' })
    }

    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ error: 'Account temporarily banned', banned_until: user.banned_until })
    }

    return res.status(200).json({ user })
  } catch (error) {
    console.error('GetMe error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function updateProfile(req: AuthRequest, res: Response) {
  const { avatar_url, full_name } = req.body

  try {
    if (avatar_url !== undefined) {
      await pool.query(
        `UPDATE users SET avatar_url = $1 WHERE id = $2`,
        [avatar_url, req.userId]
      )
    }

    if (full_name !== undefined) {
      await pool.query(
        `UPDATE profiles SET full_name = $1 WHERE user_id = $2`,
        [full_name, req.userId]
      )
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.avatar_url, u.created_at,
              p.full_name, p.birth_date, p.phone, p.cpf
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    )

    return res.status(200).json({ user: result.rows[0] })
  } catch (error) {
    console.error('Update profile error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body
  const genericResponse = { message: 'Se o e-mail estiver cadastrado, você receberá um código em breve.' }

  try {
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email])

    if (result.rows.length === 0) {
      return res.status(200).json(genericResponse)
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

    await pool.query(
      `UPDATE users SET reset_code = $1, reset_code_expires_at = $2 WHERE email = $3`,
      [code, expiresAt, email]
    )

    try {
      await sendPasswordResetEmail(email, code)
    } catch (emailError) {
      console.error('Email send failed:', emailError)
    }

    return res.status(200).json(genericResponse)
  } catch (error) {
    console.error('Forgot password error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function verifyResetCode(req: Request, res: Response) {
  const { email, code } = req.body

  try {
    const result = await pool.query(
      `SELECT reset_code, reset_code_expires_at FROM users WHERE email = $1`,
      [email]
    )

    const user = result.rows[0]

    if (!user || user.reset_code !== code || new Date() > new Date(user.reset_code_expires_at)) {
      return res.status(400).json({ error: 'Código inválido ou expirado' })
    }

    return res.status(200).json({ message: 'Código válido' })
  } catch (error) {
    console.error('Verify reset code error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { email, code, new_password } = req.body

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' })
  }

  try {
    const result = await pool.query(
      `SELECT id, reset_code, reset_code_expires_at FROM users WHERE email = $1`,
      [email]
    )

    const user = result.rows[0]

    if (!user || user.reset_code !== code || new Date() > new Date(user.reset_code_expires_at)) {
      return res.status(400).json({ error: 'Código inválido ou expirado' })
    }

    const password_hash = await bcrypt.hash(new_password, 10)

    await pool.query(
      `UPDATE users SET password = $1, reset_code = NULL, reset_code_expires_at = NULL WHERE id = $2`,
      [password_hash, user.id]
    )

    return res.status(200).json({ message: 'Senha redefinida com sucesso' })
  } catch (error) {
    console.error('Reset password error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Login com Google: o site manda o ID Token que o Google entregou. Aqui ele é
// validado com a biblioteca oficial (assinatura, validade e se foi emitido
// para o Pote Cheio). Se o e-mail já tem conta, entra nela (e liga ao Google);
// senão, cria a conta com o nome e a foto do Google.
export async function googleLogin(req: Request, res: Response) {
  const { id_token, accepted_terms, birth_date } = req.body ?? {}
  if (!id_token || typeof id_token !== 'string') {
    return res.status(400).json({ error: 'id_token is required' })
  }

  let payload
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: GOOGLE_CLIENT_ID })
    payload = ticket.getPayload()
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' })
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account email not verified' })
  }

  const googleId = payload.sub
  const email = payload.email.toLowerCase()
  const fullName = payload.name || email.split('@')[0]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let { rows } = await client.query(
      `SELECT id, email, status, banned_until, google_id FROM users
       WHERE google_id = $1 OR LOWER(email) = $2
       ORDER BY (google_id = $1) DESC NULLS LAST
       LIMIT 1`,
      [googleId, email]
    )
    let user = rows[0]

    if (user && !user.google_id) {
      // Conta já existente com o mesmo e-mail (verificado pelo Google): liga ao Google
      await client.query(`UPDATE users SET google_id = $1 WHERE id = $2`, [googleId, user.id])
    }

    if (!user) {
      // Conta nova: precisa do aceite dos termos e da data de nascimento.
      // Sem eles, o app mostra a janela de aceite e reenvia o mesmo token.
      const consentError = checkSignupConsent(accepted_terms, birth_date)
      if (consentError) {
        await client.query('ROLLBACK')
        const needsConsent = accepted_terms === undefined && birth_date === undefined
        return needsConsent
          ? res.status(428).json({ error: 'Terms required' })
          : res.status(400).json({ error: consentError })
      }

      ;({ rows } = await client.query(
        `INSERT INTO users (email, password, google_id, avatar_url, terms_accepted_at, terms_version)
         VALUES ($1, NULL, $2, $3, CURRENT_TIMESTAMP, $4)
         RETURNING id, email, status, banned_until`,
        [email, googleId, payload.picture ?? null, TERMS_VERSION]
      ))
      user = rows[0]
      await client.query(
        `INSERT INTO profiles (user_id, full_name, birth_date) VALUES ($1, $2, $3)`,
        [user.id, fullName, birth_date]
      )
    }

    await client.query('COMMIT')

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'Account disabled' })
    }
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ error: 'Account temporarily banned', banned_until: user.banned_until })
    }

    return res.status(200).json({ token: signToken(user) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Google login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  } finally {
    client.release()
  }
}

// Aceite dos termos por quem já tinha conta antes deles (ou quando a versão muda)
export async function acceptTerms(req: AuthRequest, res: Response) {
  if (req.body?.accepted_terms !== true) {
    return res.status(400).json({ error: 'Terms not accepted' })
  }
  try {
    await pool.query(
      `UPDATE users SET terms_accepted_at = CURRENT_TIMESTAMP, terms_version = $1 WHERE id = $2`,
      [TERMS_VERSION, req.userId]
    )
    return res.status(200).json({ terms_version: TERMS_VERSION })
  } catch (error) {
    console.error('Accept terms error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Exclusão da própria conta (art. 18, VI da LGPD). Confirma que é mesmo a
// pessoa: senha para quem tem senha; quem entra só pelo Google digita EXCLUIR.
export async function deleteMyAccount(req: AuthRequest, res: Response) {
  const { password, confirmation } = req.body ?? {}

  try {
    const { rows } = await pool.query(`SELECT password FROM users WHERE id = $1`, [req.userId])
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' })

    if (rows[0].password) {
      const ok = typeof password === 'string' && await bcrypt.compare(password, rows[0].password)
      if (!ok) return res.status(401).json({ error: 'Invalid password' })
    } else if (typeof confirmation !== 'string' || confirmation.trim().toUpperCase() !== 'EXCLUIR') {
      return res.status(400).json({ error: 'Confirmation required' })
    }

    await deleteUserAccount(
      req.userId as number,
      'O doador excluiu a conta e a doação foi cancelada.'
    )
    return res.status(200).json({ deleted: true })
  } catch (error) {
    console.error('Delete account error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
