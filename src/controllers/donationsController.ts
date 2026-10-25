import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { createNotification, notifyDonationFavoriters } from '../services/notificationsService'
import { addConversationTopic, findOrCreatePairConversation } from '../services/conversationsService'

const MAX_DONATION_PHOTOS = 5

export async function createDonation(req: AuthRequest, res: Response) {
  const { title, description, category, quantity } = req.body
  const photo_urls: string[] = Array.isArray(req.body.photo_urls)
    ? req.body.photo_urls.filter((url: unknown) => typeof url === 'string' && url.length > 0).slice(0, MAX_DONATION_PHOTOS)
    : []

  try {
    const { rows } = await pool.query(
      `INSERT INTO donations (user_id, title, description, category, photo_url, quantity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, title, description, category, photo_urls[0] ?? null, quantity ?? 1]
    )

    const donation = rows[0]

    for (let position = 0; position < photo_urls.length; position++) {
      await pool.query(
        `INSERT INTO donation_photos (donation_id, photo_url, position) VALUES ($1, $2, $3)`,
        [donation.id, photo_urls[position], position]
      )
    }

    donation.photos = photo_urls

    return res.status(201).json({ donation })
  } catch (error) {
    console.error('Create donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function listDonations(req: AuthRequest, res: Response) {
  const { category } = req.query
  const params: unknown[] = []
  let where = `WHERE d.status = 'available'`

  if (category) {
    params.push(category)
    where += ` AND d.category = $${params.length}`
  }

  try {
    const { rows } = await pool.query(
      `SELECT d.*, p.full_name AS donor_name
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       ${where}
       ORDER BY d.created_at DESC`,
      params
    )

    return res.status(200).json({ donations: rows })
  } catch (error) {
    console.error('List donations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function myDonations(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, rp.full_name AS reserved_for_name,
              (SELECT COUNT(*)::int FROM wishlist w WHERE w.donation_id = d.id) AS interested_count
       FROM donations d
       LEFT JOIN profiles rp ON rp.user_id = d.reserved_for_user_id
       WHERE d.user_id = $1 AND d.status <> 'closed'
       ORDER BY d.created_at DESC`,
      [req.userId]
    )

    return res.status(200).json({ donations: rows })
  } catch (error) {
    console.error('My donations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Entregas em andamento do usuário logado ("Ver entregas"): só as
// negociações já aceitas, nas duas pontas (enviando e recebendo),
// classificadas por etapa: accepted | shipped.
export async function donationStatus(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT d.id AS donation_id, d.title, d.photo_url, h.status AS transaction_status,
              COALESCE(h.shipped_at, h.donated_at) AS updated_at,
              CASE WHEN h.donor_id = $1 THEN 'donor' ELSE 'recipient' END AS role,
              CASE WHEN h.donor_id = $1 THEN h.recipient_id ELSE h.donor_id END AS other_user_id,
              op.full_name AS other_user_name
       FROM donation_history h
       JOIN donations d ON d.id = h.donation_id
       LEFT JOIN profiles op ON op.user_id = CASE WHEN h.donor_id = $1 THEN h.recipient_id ELSE h.donor_id END
       WHERE (h.donor_id = $1 OR h.recipient_id = $1)
         AND h.status IN ('accepted_awaiting_shipment', 'shipped')
         AND d.status = 'reserved'
       ORDER BY updated_at DESC`,
      [req.userId]
    )

    const items = rows.map(({ transaction_status, ...r }) => ({
      ...r,
      stage: transaction_status === 'shipped' ? 'shipped' : 'accepted',
    }))

    return res.status(200).json({ items })
  } catch (error) {
    console.error('Donation status error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Histórico completo do usuário logado ("Ver doações"), nas duas pontas:
//   pending   -> ainda sem doação aceita (alguém demonstrou interesse / reserva)
//   accepted | shipped -> negociação em andamento
//   completed -> doada / recebida
//   cancelled -> negociação cancelada
//   closed | removed -> publicação do usuário encerrada por ele ou pela moderação
export async function donationHistory(req: AuthRequest, res: Response) {
  try {
    const [transactions, donorPending, recipientPending, ownClosed] = await Promise.all([
      pool.query(
        `SELECT h.id AS history_id, d.id AS donation_id, d.title, d.photo_url, h.status AS transaction_status,
                COALESCE(h.finalized_at, h.cancelled_at, h.shipped_at, h.donated_at) AS updated_at,
                CASE WHEN h.donor_id = $1 THEN 'donor' ELSE 'recipient' END AS role,
                CASE WHEN h.donor_id = $1 THEN h.recipient_id ELSE h.donor_id END AS other_user_id,
                op.full_name AS other_user_name
         FROM donation_history h
         JOIN donations d ON d.id = h.donation_id
         LEFT JOIN profiles op ON op.user_id = CASE WHEN h.donor_id = $1 THEN h.recipient_id ELSE h.donor_id END
         WHERE h.donor_id = $1 OR h.recipient_id = $1`,
        [req.userId]
      ),
      pool.query(
        `SELECT d.id AS donation_id, d.title, d.photo_url, d.created_at AS updated_at,
                d.reserved_for_user_id AS other_user_id, rp.full_name AS other_user_name, d.reserved_until,
                (SELECT COUNT(*)::int FROM wishlist w WHERE w.donation_id = d.id) AS interested_count
         FROM donations d
         LEFT JOIN profiles rp ON rp.user_id = d.reserved_for_user_id
         WHERE d.user_id = $1 AND (
           (d.status = 'available' AND EXISTS (SELECT 1 FROM wishlist w WHERE w.donation_id = d.id))
           OR (d.status = 'reserved' AND d.reserved_for_user_id IS NOT NULL
               AND NOT EXISTS (
                 SELECT 1 FROM donation_history h
                 WHERE h.donation_id = d.id AND h.status IN ('accepted_awaiting_shipment', 'shipped')
               ))
         )`,
        [req.userId]
      ),
      pool.query(
        `SELECT d.id AS donation_id, d.title, d.photo_url, w.created_at AS updated_at,
                d.user_id AS other_user_id, p.full_name AS other_user_name, d.reserved_until,
                (d.status = 'reserved') AS reserved_for_me
         FROM wishlist w
         JOIN donations d ON d.id = w.donation_id
         LEFT JOIN profiles p ON p.user_id = d.user_id
         WHERE w.user_id = $1
           AND (d.status = 'available' OR (d.status = 'reserved' AND d.reserved_for_user_id = $1))
           AND NOT EXISTS (
             SELECT 1 FROM donation_history h
             WHERE h.donation_id = d.id AND h.status IN ('accepted_awaiting_shipment', 'shipped')
           )`,
        [req.userId]
      ),
      pool.query(
        `SELECT d.id AS donation_id, d.title, d.photo_url, d.status,
                COALESCE(d.closed_at, d.removed_at, d.cancelled_at, d.created_at) AS updated_at
         FROM donations d
         WHERE d.user_id = $1 AND d.status IN ('closed', 'removed', 'cancelled')`,
        [req.userId]
      ),
    ])

    const transactionStage = (status: string) => {
      if (status === 'finalized_manual' || status === 'finalized_automatic') return 'completed'
      if (status === 'shipped') return 'shipped'
      if (status === 'cancelled') return 'cancelled'
      return 'accepted'
    }

    const items = [
      ...transactions.rows.map(({ history_id, transaction_status, ...r }) => ({
        ...r,
        key: `h${history_id}`,
        stage: transactionStage(transaction_status),
      })),
      ...donorPending.rows.map(r => ({ ...r, key: `p${r.donation_id}`, role: 'donor', stage: 'pending' })),
      ...recipientPending.rows.map(r => ({ ...r, key: `w${r.donation_id}`, role: 'recipient', stage: 'pending' })),
      ...ownClosed.rows.map(({ status, ...r }) => ({
        ...r,
        key: `c${r.donation_id}`,
        role: 'donor',
        stage: status === 'removed' ? 'removed' : 'closed',
        other_user_id: null,
        other_user_name: null,
      })),
    ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    return res.status(200).json({ items })
  } catch (error) {
    console.error('Donation history error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getDonation(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT d.*, d.user_id AS donor_id, p.full_name AS donor_name,
              u.created_at AS donor_created_at, u.avatar_url AS donor_avatar_url,
              EXISTS (
                SELECT 1 FROM donation_history h
                WHERE h.donation_id = d.id AND h.recipient_id = $2
                  AND h.status IN ('finalized_manual', 'finalized_automatic')
              ) AS received_by_me,
              EXISTS (
                SELECT 1 FROM donation_history h
                WHERE h.donation_id = d.id AND h.recipient_id = $2
                  AND h.status IN ('accepted_awaiting_shipment', 'shipped')
              ) AS is_my_transaction
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id, req.userId ?? null]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    const donation = rows[0]
    const isOwner = donation.user_id === req.userId

    // Publicação retirada pela moderação: quem não é o dono só fica sabendo
    // que ela foi retirada, sem ver o conteúdo nem o motivo.
    if (donation.status === 'removed' && !isOwner) {
      return res.status(200).json({
        donation: { id: donation.id, status: 'removed', received_by_me: false, is_my_transaction: false },
      })
    }
    if (!isOwner) {
      delete donation.removed_reason
      delete donation.cancel_reason
    }

    const photos = await pool.query(
      `SELECT photo_url FROM donation_photos WHERE donation_id = $1 ORDER BY position ASC`,
      [id]
    )
    donation.photos = photos.rows.map(row => row.photo_url)

    return res.status(200).json({ donation })
  } catch (error) {
    console.error('Get donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function updateStatus(req: AuthRequest, res: Response) {
  const { id } = req.params
  const { status } = req.body

  try {
    const donation = await pool.query(
      `SELECT id, user_id FROM donations WHERE id = $1`,
      [id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    if (donation.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { rows } = await pool.query(
      `UPDATE donations SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    )

    return res.status(200).json({ donation: rows[0] })
  } catch (error) {
    console.error('Update status error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function completeDonation(req: AuthRequest, res: Response) {
  const { id } = req.params
  const { recipient_id } = req.body

  try {
    const donation = await pool.query(
      `SELECT id, user_id FROM donations WHERE id = $1`,
      [id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    if (donation.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    await pool.query(
      `UPDATE donations SET status = 'completed' WHERE id = $1`,
      [id]
    )

    await pool.query(
      `INSERT INTO donation_history (donation_id, donor_id, recipient_id)
       VALUES ($1, $2, $3)`,
      [id, req.userId, recipient_id]
    )

    return res.status(200).json({ message: 'Donation completed' })
  } catch (error) {
    console.error('Complete donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function addToWishlist(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params
  const user_id = req.userId

  try {
    const donation = await pool.query(
      `SELECT id, user_id, title FROM donations WHERE id = $1 AND status = 'available'`,
      [donation_id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found or unavailable' })
    }

    if (donation.rows[0].user_id === user_id) {
      return res.status(400).json({ error: 'You cannot wish for your own donation' })
    }

    await pool.query(
      `INSERT INTO wishlist (donation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [donation_id, user_id]
    )

    // Mesma conversa de sempre entre os dois; a doação entra como novo assunto
    const conversation_id = await findOrCreatePairConversation(user_id as number, donation.rows[0].user_id, Number(donation_id))
    const newTopic = await addConversationTopic(conversation_id, Number(donation_id), user_id as number)

    if (newTopic) {
      await createNotification({
        user_id: donation.rows[0].user_id,
        type: 'interest',
        title: 'Alguém se interessou pela sua doação!',
        message: `Um usuário demonstrou interesse em "${donation.rows[0].title}".`,
        reference_id: conversation_id,
        reference_type: 'conversation',
      })
    }

    return res.status(201).json({ conversation_id })
  } catch (error) {
    console.error('Add to wishlist error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function removeFromWishlist(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params

  try {
    await pool.query(
      `DELETE FROM wishlist WHERE donation_id = $1 AND user_id = $2`,
      [donation_id, req.userId]
    )

    return res.status(200).json({ message: 'Removed from wishlist' })
  } catch (error) {
    console.error('Remove from wishlist error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function myWishlist(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, p.full_name AS donor_name, w.created_at AS added_at,
              EXISTS (
                SELECT 1 FROM donation_history h
                WHERE h.donation_id = d.id AND h.recipient_id = $1
                  AND h.status IN ('finalized_manual', 'finalized_automatic')
              ) AS received_by_me
       FROM wishlist w
       JOIN donations d ON d.id = w.donation_id
       JOIN profiles p ON p.user_id = d.user_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.userId]
    )

    // Motivos de cancelamento/remoção são só do dono da publicação
    const donations = rows.map(({ cancel_reason, removed_reason, ...d }) => d)

    return res.status(200).json({ donations })
  } catch (error) {
    console.error('My wishlist error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// "Excluir" do dono: em vez de apagar do banco (o que levava junto os
// favoritos de quem marcou o item), encerra a publicação. Ela sai do
// catálogo e de "Minhas doações", cancela qualquer negociação em andamento e
// avisa quem tinha favoritado.
export async function deleteDonation(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const donationResult = await pool.query(
      `SELECT id, user_id, title, status, reserved_for_user_id FROM donations WHERE id = $1`,
      [id]
    )

    if (donationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    const donation = donationResult.rows[0]
    if (donation.user_id !== req.userId) {
      return res.status(403).json({ message: 'Você não tem permissão para encerrar esta doação' })
    }
    if (['completed', 'closed', 'removed'].includes(donation.status)) {
      return res.status(400).json({ error: 'Esta doação não pode mais ser encerrada' })
    }

    const { rows: historyRows } = await pool.query(
      `SELECT id, recipient_id FROM donation_history
       WHERE donation_id = $1 AND status IN ('accepted_awaiting_shipment', 'shipped')
       ORDER BY id DESC LIMIT 1`,
      [id]
    )
    const history = historyRows[0]
    const recipientId: number | null =
      history?.recipient_id ?? (donation.status === 'reserved' ? donation.reserved_for_user_id : null)

    if (history) {
      await pool.query(
        `UPDATE donation_history SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = 'donor' WHERE id = $1`,
        [history.id]
      )
    }

    await pool.query(
      `UPDATE donations
       SET status = 'closed', closed_at = CURRENT_TIMESTAMP,
           reserved_for_user_id = NULL, reserved_until = NULL,
           cancel_reason = COALESCE($1::text, cancel_reason)
       WHERE id = $2`,
      [recipientId ? 'O doador encerrou a publicação e a negociação foi cancelada.' : null, id]
    )

    if (recipientId) {
      await createNotification({
        user_id: recipientId,
        type: 'donation',
        title: 'Doação cancelada',
        message: `O doador encerrou "${donation.title}" e a negociação foi cancelada.`,
        reference_id: Number(id),
        reference_type: 'donation',
      })
    }

    await notifyDonationFavoriters(Number(id), donation.title, recipientId ? [recipientId] : [])

    return res.status(200).json({ message: 'Doação encerrada com sucesso' })
  } catch (error) {
    console.error('Close donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getInterestedUsers(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params

  try {
    const donation = await pool.query(
      `SELECT id, user_id FROM donations WHERE id = $1`,
      [donation_id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    if (donation.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const { rows } = await pool.query(
      `SELECT w.user_id, p.full_name, u.avatar_url, c.id AS conversation_id
       FROM wishlist w
       JOIN profiles p ON p.user_id = w.user_id
       JOIN users u ON u.id = w.user_id
       LEFT JOIN conversations c
         ON LEAST(c.sender_id, c.recipient_id) = LEAST(w.user_id, $2::int)
        AND GREATEST(c.sender_id, c.recipient_id) = GREATEST(w.user_id, $2::int)
       WHERE w.donation_id = $1
       ORDER BY w.created_at ASC`,
      [donation_id, req.userId]
    )

    return res.status(200).json({ interested: rows })
  } catch (error) {
    console.error('Get interested users error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function confirmDonation(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params
  const { user_id: recipient_id } = req.body

  try {
    const donation = await pool.query(
      `SELECT id, user_id, title FROM donations WHERE id = $1`,
      [donation_id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    if (donation.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Permission denied' })
    }

    const inWishlist = await pool.query(
      `SELECT id FROM wishlist WHERE donation_id = $1 AND user_id = $2`,
      [donation_id, recipient_id]
    )

    if (inWishlist.rows.length === 0) {
      return res.status(400).json({ message: 'Este usuário não demonstrou interesse nesta doação' })
    }

    // A doação só é marcada como 'completed' quando a transação for
    // finalizada (beneficiário confirma o recebimento, doador confirma em
    // nome dele, ou a auto-finalização entra em ação). Aceitar só reserva.
    const { rows } = await pool.query(
      `UPDATE donations SET status = 'reserved' WHERE id = $1 RETURNING *`,
      [donation_id]
    )

    const transaction = await pool.query(
      `INSERT INTO donation_history (donation_id, donor_id, recipient_id, status)
       VALUES ($1, $2, $3, 'accepted_awaiting_shipment') RETURNING id`,
      [donation_id, req.userId, recipient_id]
    )

    await createNotification({
      user_id: recipient_id,
      type: 'donation',
      title: 'Doação confirmada!',
      message: `Sua solicitação de "${donation.rows[0].title}" foi aceita pelo doador. Acompanhe o envio na tela da doação.`,
      reference_id: Number(donation_id),
      reference_type: 'donation',
    })

    return res.status(200).json({ donation: rows[0], transaction_id: transaction.rows[0].id })
  } catch (error) {
    console.error('Confirm donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const RESERVE_DAYS = 3

export async function reserveDonation(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params
  const { user_id } = req.body

  try {
    const donation = await pool.query(
      `SELECT id, user_id, status, title FROM donations WHERE id = $1`,
      [donation_id]
    )

    if (donation.rows.length === 0) return res.status(404).json({ error: 'Donation not found' })
    if (donation.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Permission denied' })
    if (donation.rows[0].status !== 'available') {
      return res.status(400).json({ error: 'Donation is not available' })
    }

    const inWishlist = await pool.query(
      `SELECT id FROM wishlist WHERE donation_id = $1 AND user_id = $2`,
      [donation_id, user_id]
    )
    if (inWishlist.rows.length === 0) {
      return res.status(400).json({ message: 'Este usuário não demonstrou interesse nesta doação' })
    }

    const { rows } = await pool.query(
      `UPDATE donations
       SET status = 'reserved', reserved_for_user_id = $1, reserved_until = CURRENT_TIMESTAMP + interval '${RESERVE_DAYS} days'
       WHERE id = $2 RETURNING *`,
      [user_id, donation_id]
    )

    await createNotification({
      user_id,
      type: 'donation',
      title: 'Doação reservada para você!',
      message: `O doador reservou "${donation.rows[0].title}" para você por ${RESERVE_DAYS} dias.`,
      reference_id: Number(donation_id),
      reference_type: 'donation',
    })

    // Junto o nome de quem vai receber: sem ele o app mostrava "Reservado para alguém"
    const { rows: nameRows } = await pool.query(`SELECT full_name FROM profiles WHERE user_id = $1`, [user_id])

    return res.status(200).json({ donation: { ...rows[0], reserved_for_name: nameRows[0]?.full_name ?? null } })
  } catch (error) {
    console.error('Reserve donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function unreserveDonation(req: AuthRequest, res: Response) {
  const { id: donation_id } = req.params

  try {
    const donation = await pool.query(
      `SELECT id, user_id, reserved_for_user_id FROM donations WHERE id = $1`,
      [donation_id]
    )

    if (donation.rows.length === 0) return res.status(404).json({ error: 'Donation not found' })
    if (donation.rows[0].user_id !== req.userId) return res.status(403).json({ error: 'Permission denied' })
    if (!donation.rows[0].reserved_for_user_id) {
      return res.status(400).json({ error: 'Donation is not softly reserved' })
    }

    const { rows } = await pool.query(
      `UPDATE donations SET status = 'available', reserved_for_user_id = NULL, reserved_until = NULL
       WHERE id = $1 RETURNING *`,
      [donation_id]
    )

    return res.status(200).json({ donation: rows[0] })
  } catch (error) {
    console.error('Unreserve donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

// Roda periodicamente (ver server.ts): libera sozinha qualquer reserva
// "leve" (feita por reserveDonation, sem transação de envio) vencida há
// mais de RESERVE_DAYS dias sem o doador ter confirmado nem desreservado.
export async function releaseExpiredReservations(): Promise<void> {
  try {
    const result = await pool.query(
      `UPDATE donations
       SET status = 'available', reserved_for_user_id = NULL, reserved_until = NULL
       WHERE status = 'reserved' AND reserved_for_user_id IS NOT NULL AND reserved_until < CURRENT_TIMESTAMP`
    )
    if (result.rowCount) console.log(`[releaseExpiredReservations] Liberou ${result.rowCount} reserva(s) vencida(s)`)
  } catch (error) {
    console.error('Release expired reservations error:', error)
  }
}

// Público (sem login): mesmos números que o próprio usuário vê no seu
// perfil (Itens doados / Recebidos / Reservados), pra aparecer também no
// perfil público de qualquer doador.
export async function getUserDonationStats(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const [donated, reserved, received] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM donations WHERE user_id = $1 AND status = 'completed'`, [id]),
      pool.query(`SELECT COUNT(*)::int AS count FROM donations WHERE user_id = $1 AND status = 'reserved'`, [id]),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM wishlist w
         JOIN donations d ON d.id = w.donation_id
         WHERE w.user_id = $1 AND d.status = 'completed'`,
        [id]
      ),
    ])

    return res.status(200).json({
      donated_count: donated.rows[0].count,
      reserved_count: reserved.rows[0].count,
      received_count: received.rows[0].count,
    })
  } catch (error) {
    console.error('Get user donation stats error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
