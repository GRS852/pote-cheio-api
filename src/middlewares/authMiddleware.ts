import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getAccountBlock } from '../services/accountStatus'

export interface AuthRequest extends Request {
  userId?: number
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token not provided' })
  }

  const token = authHeader.split(' ')[1]

  let userId: number
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number }
    userId = payload.id
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    const block = await getAccountBlock(userId)
    if (block) return res.status(block.status).json(block.body)
  } catch (error) {
    console.error('Auth middleware account check error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }

  req.userId = userId
  next()
}
