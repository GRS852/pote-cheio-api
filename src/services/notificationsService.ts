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

// Avisa todo mundo que favoritou a doação que ela foi encerrada (pelo dono
// ou pela moderação). Quem já recebeu um aviso específico (ex: a pessoa com
// quem a negociação foi cancelada) fica de fora pra não receber dois.
export async function notifyDonationFavoriters(donationId: number, title: string, excludeUserIds: number[] = []) {
  const { rows } = await pool.query(
    `SELECT w.user_id FROM wishlist w
     JOIN donations d ON d.id = w.donation_id
     WHERE w.donation_id = $1 AND w.user_id <> d.user_id`,
    [donationId]
  )

  for (const { user_id } of rows) {
    if (excludeUserIds.includes(user_id)) continue
    await createNotification({
      user_id,
      type: 'donation',
      title: 'Essa doação foi encerrada',
      message: `"${title}", que estava nos seus favoritos, foi encerrada e não está mais disponível.`,
      reference_id: donationId,
      reference_type: 'donation',
    })
  }
}
