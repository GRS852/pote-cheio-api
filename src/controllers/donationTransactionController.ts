import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { createNotification } from '../services/notificationsService'

const AUTO_FINALIZE_DAYS = 7

async function findTransaction(donationId: string | string[]) {
  const { rows } = await pool.query(
    `SELECT h.*, d.title, d.photo_url AS donation_photo_url,
            pd.full_name AS donor_name, pr.full_name AS recipient_name,
            EXISTS(SELECT 1 FROM donation_ratings r WHERE r.donation_history_id = h.id) AS has_rating,
            EXISTS(SELECT 1 FROM donation_comments c WHERE c.donation_history_id = h.id) AS has_comment
     FROM donation_history h
     JOIN donations d ON d.id = h.donation_id
     JOIN profiles pd ON pd.user_id = h.donor_id
     JOIN profiles pr ON pr.user_id = h.recipient_id
     WHERE h.donation_id = $1
     ORDER BY h.id DESC
     LIMIT 1`,
    [donationId]
  )
  return rows[0] ?? null
}

export async function getTransaction(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const transaction = await findTransaction(id)
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' })
    if (transaction.donor_id !== req.userId && transaction.recipient_id !== req.userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    return res.status(200).json({ transaction })
  } catch (error) {
    console.error('Get transaction error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function shipTransaction(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const transaction = await findTransaction(id)
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' })
    if (transaction.donor_id !== req.userId) return res.status(403).json({ error: 'Permission denied' })
    if (transaction.status !== 'accepted_awaiting_shipment') {
      return res.status(400).json({ error: 'Transaction is not awaiting shipment' })
    }

    const { rows } = await pool.query(
      `UPDATE donation_history
       SET status = 'shipped', shipped_at = CURRENT_TIMESTAMP,
           auto_finalize_at = CURRENT_TIMESTAMP + interval '${AUTO_FINALIZE_DAYS} days'
       WHERE id = $1 RETURNING *`,
      [transaction.id]
    )

    await createNotification({
      user_id: transaction.recipient_id,
      type: 'donation',
      title: 'Sua doação foi enviada!',
      message: `"${transaction.title}" foi marcada como enviada pelo doador. Assim que receber, confirme na tela da doação.`,
      reference_id: Number(id),
      reference_type: 'donation',
    })

    return res.status(200).json({ transaction: rows[0] })
  } catch (error) {
    console.error('Ship transaction error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function receiveTransaction(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const transaction = await findTransaction(id)
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' })
    if (transaction.recipient_id !== req.userId) return res.status(403).json({ error: 'Permission denied' })
    if (transaction.status !== 'shipped') {
      return res.status(400).json({ error: 'Transaction has not been shipped yet' })
    }

    const { rows } = await pool.query(
      `UPDATE donation_history
       SET status = 'finalized_manual', finalized_by = 'recipient',
           received_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [transaction.id]
    )

    await pool.query(`UPDATE donations SET status = 'completed' WHERE id = $1`, [transaction.donation_id])

    await createNotification({
      user_id: transaction.donor_id,
      type: 'donation',
      title: 'Recebimento confirmado!',
      message: `O beneficiário confirmou que recebeu "${transaction.title}".`,
      reference_id: Number(id),
      reference_type: 'donation',
    })

    return res.status(200).json({ transaction: rows[0] })
  } catch (error) {
    console.error('Receive transaction error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function donorConfirmReceived(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const transaction = await findTransaction(id)
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' })
    if (transaction.donor_id !== req.userId) return res.status(403).json({ error: 'Permission denied' })
    // Doações costumam ser feitas presencialmente: o doador pode finalizar
    // direto (sem passar pela etapa opcional de "enviado") a qualquer momento
    // antes de já estar finalizada.
    if (transaction.status !== 'accepted_awaiting_shipment' && transaction.status !== 'shipped') {
      return res.status(400).json({ error: 'Transaction is already finalized' })
    }

    const { rows } = await pool.query(
      `UPDATE donation_history
       SET status = 'finalized_manual', finalized_by = 'donor',
           donor_marked_received_at = CURRENT_TIMESTAMP, finalized_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [transaction.id]
    )

    await pool.query(`UPDATE donations SET status = 'completed' WHERE id = $1`, [transaction.donation_id])

    await createNotification({
      user_id: transaction.recipient_id,
      type: 'donation',
      title: 'Doação finalizada',
      message: `O doador confirmou que você recebeu "${transaction.title}".`,
      reference_id: Number(id),
      reference_type: 'donation',
    })

    return res.status(200).json({ transaction: rows[0] })
  } catch (error) {
    console.error('Donor confirm received error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Roda periodicamente (ver server.ts): fecha sozinha qualquer transação
// enviada há mais de AUTO_FINALIZE_DAYS dias sem que nenhuma das partes
// tenha confirmado o recebimento.
export async function autoFinalizeStaleTransactions(): Promise<void> {
  try {
    const { rows } = await pool.query(
      `UPDATE donation_history
       SET status = 'finalized_automatic', finalized_by = 'automatic', finalized_at = CURRENT_TIMESTAMP
       WHERE status = 'shipped' AND auto_finalize_at < CURRENT_TIMESTAMP
       RETURNING id, donation_id`
    )

    if (rows.length === 0) return

    for (const row of rows) {
      await pool.query(`UPDATE donations SET status = 'completed' WHERE id = $1`, [row.donation_id])
    }

    console.log(`[autoFinalizeStaleTransactions] Finalizou automaticamente ${rows.length} transação(ões)`)
  } catch (error) {
    console.error('Auto finalize stale transactions error:', error)
  }
}
