import { Server } from 'socket.io'
import { Server as HttpServer } from 'http'
import jwt from 'jsonwebtoken'
import pool from '../db'
import { createTextMessage } from '../services/conversationsService'

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
    // Detecta conexão caída mais rápido (padrão: ping a cada 25s, espera 20s)
    pingInterval: 10000,
    pingTimeout: 8000,
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

    // Mantido por compatibilidade: as mensagens agora chegam pela sala
    // pessoal (user_<id>), que é refeita sozinha a cada reconexão.
    socket.on('join_room', async ({ conversation_id }: { conversation_id: number }) => {
      try {
        const result = await pool.query(
          `SELECT id FROM conversations
           WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
          [conversation_id, userId]
        )

        if (result.rows.length === 0) return

        socket.join(`conversation_${conversation_id}`)
      } catch (error) {
        console.error('Socket join_room error:', error)
      }
    })

    // client_id é um id temporário gerado pelo app pra mensagem otimista;
    // volta no evento pra quem enviou trocar a mensagem provisória pela real.
    socket.on(
      'send_message',
      async ({ conversation_id, content, client_id, donation_id }: { conversation_id: number; content: string; client_id?: string; donation_id?: number | null }) => {
        try {
          await createTextMessage(Number(conversation_id), userId, content, client_id ?? null, donation_id ?? null)
        } catch (error) {
          console.error('Socket send_message error:', error)
        }
      }
    )
  })

  return io
}
