import pool from '../db'
import { getIo } from '../socket'
import { createNotification } from './notificationsService'
import { deleteStorageFiles } from './storageService'

type PendingNotification = Parameters<typeof createNotification>[0]

// Apaga a conta e os dados pessoais de um usuário (direito de eliminação,
// art. 18, VI da LGPD). Usado quando a própria pessoa exclui a conta e na
// limpeza das contas desativadas pela moderação há mais de 30 dias.
//
// Antes de apagar, desfaz o que estava em andamento com outras pessoas:
// - doações dele reservadas/em entrega: canceladas, e quem ia receber é avisado;
// - doações de outros reservadas para ele: voltam a ficar disponíveis, e o
//   doador é avisado.
// Depois o DELETE em users apaga em cascata perfil, doações, favoritos,
// conversas, mensagens, notificações, avaliações e denúncias feitas por ele.
// No histórico de doações da outra pessoa ele vira "Usuário excluído".
export async function deleteUserAccount(userId: number, donorReason: string): Promise<boolean> {
  const notifications: PendingNotification[] = []
  let fileUrls: (string | null)[] = []

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const exists = await client.query(`SELECT avatar_url FROM users WHERE id = $1 FOR UPDATE`, [userId])
    if (exists.rows.length === 0) {
      await client.query('ROLLBACK')
      return false
    }

    // Arquivos no Storage que deixam de ser usados (apagados depois do COMMIT)
    const files = await client.query(
      `SELECT photo_url FROM donations WHERE user_id = $1
       UNION ALL
       SELECT dp.photo_url FROM donation_photos dp JOIN donations d ON d.id = dp.donation_id WHERE d.user_id = $1
       UNION ALL
       SELECT cp.photo_url FROM donation_comment_photos cp
       JOIN donation_comments c ON c.id = cp.comment_id
       WHERE c.donor_id = $1 OR c.recipient_id = $1`,
      [userId]
    )
    fileUrls = [exists.rows[0].avatar_url, ...files.rows.map(r => r.photo_url)]

    // 1) Doações DELE em andamento: cancela e avisa quem ia receber
    const mine = await client.query(
      `SELECT d.id, d.reserved_for_user_id,
              (SELECT h.recipient_id FROM donation_history h
               WHERE h.donation_id = d.id AND h.status IN ('accepted_awaiting_shipment', 'shipped')
               ORDER BY h.id DESC LIMIT 1) AS recipient_id
       FROM donations d
       WHERE d.user_id = $1 AND d.status = 'reserved'`,
      [userId]
    )
    for (const donation of mine.rows) {
      const recipientId = donation.recipient_id ?? donation.reserved_for_user_id
      if (recipientId) {
        notifications.push({
          user_id: recipientId,
          type: 'donation',
          title: 'Doação cancelada',
          message: donorReason,
        })
      }
    }

    // 2) Doações de OUTROS reservadas/em entrega para ele: voltam a ficar
    //    disponíveis e o doador é avisado
    const forMe = await client.query(
      `SELECT DISTINCT d.id, d.user_id AS donor_id, d.title
       FROM donations d
       LEFT JOIN donation_history h
         ON h.donation_id = d.id AND h.recipient_id = $1
        AND h.status IN ('accepted_awaiting_shipment', 'shipped')
       WHERE d.status = 'reserved' AND d.user_id <> $1
         AND (d.reserved_for_user_id = $1 OR h.id IS NOT NULL)`,
      [userId]
    )
    for (const donation of forMe.rows) {
      await client.query(
        `UPDATE donation_history SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = 'system'
         WHERE donation_id = $1 AND recipient_id = $2 AND status IN ('accepted_awaiting_shipment', 'shipped')`,
        [donation.id, userId]
      )
      await client.query(
        `UPDATE donations SET status = 'available', reserved_for_user_id = NULL, reserved_until = NULL
         WHERE id = $1`,
        [donation.id]
      )
      notifications.push({
        user_id: donation.donor_id,
        type: 'donation',
        title: 'Doação disponível novamente',
        message: `A pessoa que ia receber "${donation.title}" excluiu a conta. A doação voltou a ficar disponível.`,
        reference_id: donation.id,
        reference_type: 'donation',
      })
    }

    // 3) Apaga a conta (e, em cascata, os dados ligados a ela)
    await client.query(`DELETE FROM users WHERE id = $1`, [userId])

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }

  // Depois do COMMIT: avisos, derruba conexões abertas e apaga os arquivos
  for (const n of notifications) {
    await createNotification(n).catch(err => console.error('Account deletion notification error:', err))
  }
  getIo()?.in(`user_${userId}`).disconnectSockets(true)
  await deleteStorageFiles(fileUrls)
  return true
}
