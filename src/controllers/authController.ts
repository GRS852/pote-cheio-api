import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function register(req: Request, res: Response) {
  const { nome_completo, email, senha, data_nascimento } = req.body

  try {
    const userExists = await pool.query(
      'SELECT id FROM usuarios_login WHERE email = $1',
      [email]
    )

    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'Email já cadastrado' })
    }

    const senha_hash = await bcrypt.hash(senha, 10)

    const { rows } = await pool.query(
      'INSERT INTO usuarios_login (email, senha) VALUES ($1, $2) RETURNING id, email',
      [email, senha_hash]
    )

    await pool.query(
      'INSERT INTO clientes (usuario_id, nome_completo, data_nascimento) VALUES ($1, $2, $3)',
      [rows[0].id, nome_completo, data_nascimento ?? null]
    )

    const token = jwt.sign(
      { id: rows[0].id, email: rows[0].email },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' }
    )

    return res.status(201).json({ token })
  } catch (error) {
    console.error('Erro no register:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function getMe(req: AuthRequest, res: Response) {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.criado_em, c.nome_completo, c.data_nascimento, c.telefone, c.cpf
       FROM usuarios_login u
       LEFT JOIN clientes c ON c.usuario_id = u.id
       WHERE u.id = $1`,
      [req.usuarioId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    return res.status(200).json({ usuario: result.rows[0] })
  } catch (error) {
    console.error('Erro no getMe:', error)
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}

export async function login(req: Request, res: Response) {
  const { email, senha } = req.body

  try {
    const result = await pool.query(
      'SELECT * FROM usuarios_login WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' })
    }

    const usuario = result.rows[0]
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha)

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
    return res.status(500).json({ error: 'Erro interno do servidor' })
  }
}
