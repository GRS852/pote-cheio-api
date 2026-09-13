import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AuthRequest } from './authMiddleware'

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number }
      req.userId = payload.id
    } catch {
      // Token ausente, inválido ou expirado: segue a requisição como visitante anônimo
    }
  }

  next()
}
