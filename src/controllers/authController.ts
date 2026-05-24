import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'

export async function register(req: Request, res: Response) {
  const { nome, email, senha } = req.body

  try {
    const userExists = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    )

    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' })
    }

    const senha_hash = await bcrypt.hash(senha, 10)

    const result = await pool.query(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id, nome, email',
      [nome, email, senha_hash]
    )

    return res.status(201).json({ usuario: result.rows[0] })
  } catch (error) {
    console.error('Erro no register:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function login(req: Request, res: Response) {
  const { email, senha } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const usuario = result.rows[0]
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash)

    if (!senhaCorreta) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    )

    return res.status(200).json({ token })
  } catch (error) {
    console.error('Erro no login:', error)
    return res.status(500).json({ error: 'Erro interno do servidor', detail: String(error) })
  }
}