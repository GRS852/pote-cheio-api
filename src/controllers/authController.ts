import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { sendPasswordResetEmail } from '../services/emailService'

export async function register(req: Request, res: Response) {
  const { full_name, email, password, birth_date } = req.body

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
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email',
      [email, password_hash]
    )

    await pool.query(
      'INSERT INTO profiles (user_id, full_name, birth_date) VALUES ($1, $2, $3)',
      [rows[0].id, full_name, birth_date ?? null]
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
    const passwordMatch = await bcrypt.compare(password, user.password)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    )

    return res.status(200).json({ token })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.avatar_url, u.created_at,
              p.full_name, p.birth_date, p.phone, p.cpf
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    return res.status(200).json({ user: result.rows[0] })
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
