import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import pool from '../db'

let io: Server

export function getIo() {
  return io
}

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: 'https://potecheio.site',
      methods: ['GET', 'POST'],
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string

    if (!token) return next(new Error('Token not provided'))

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { id: number }
      socket.data.userId = payload.id
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId as number

    // Personal room for real-time notifications
    socket.join(`user_${userId}`)

    socket.on('join_room', async ({ conversation_id }: { conversation_id: number }) => {
      const result = await pool.query(
        `SELECT id FROM conversations
         WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
        [conversation_id, userId]
      )

      if (result.rows.length === 0) return

      socket.join(`conversation_${conversation_id}`)
    })

    socket.on('send_message', async ({ conversation_id, content }: { conversation_id: number; content: string }) => {
      const conversation = await pool.query(
        `SELECT id FROM conversations
         WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
        [conversation_id, userId]
      )

      if (conversation.rows.length === 0) return

      const { rows } = await pool.query(
        `INSERT INTO messages (conversation_id, author_id, content)
         VALUES ($1, $2, $3) RETURNING id, author_id, content, sent_at`,
        [conversation_id, userId, content]
      )

      io.to(`conversation_${conversation_id}`).emit('new_message', rows[0])
    })
  })

  return io
}
