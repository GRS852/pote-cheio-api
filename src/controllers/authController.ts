import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

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
      `SELECT u.id, u.email, u.created_at, p.full_name, p.birth_date, p.phone, p.cpf
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
