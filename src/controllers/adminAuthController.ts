import { Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function adminLogin(req: AuthRequest, res: Response) {
  const { email, password } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM admins WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const admin = result.rows[0]
    const passwordMatch = await bcrypt.compare(password, admin.password)

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '12h' }
    )

    return res.status(200).json({ token, admin: { id: admin.id, email: admin.email, full_name: admin.full_name } })
  } catch (error) {
    console.error('Admin login error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
