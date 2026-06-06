import pool from '../db'
import { getIo } from '../socket'

interface CreateNotificationParams {
  user_id: number
  type: string
  title: string
  message: string
  reference_id?: number
  reference_type?: string
}

export async function createNotification(params: CreateNotificationParams) {
  const { user_id, type, title, message, reference_id, reference_type } = params

  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [user_id, type, title, message, reference_id ?? null, reference_type ?? null]
  )

  const io = getIo()
  if (io) {
    io.to(`user_${user_id}`).emit('new_notification', rows[0])
  }

  return rows[0]
}
