import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AdminAuthRequest extends Request {
  adminId?: number
}

export function adminAuthMiddleware(req: AdminAuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token not provided' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { adminId?: number }

    if (!payload.adminId) {
      return res.status(403).json({ error: 'Not an admin token' })
    }

    req.adminId = payload.adminId
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
