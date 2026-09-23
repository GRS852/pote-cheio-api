import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { createNotification } from '../services/notificationsService'

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
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [req.userId]
    )

    return res.status(200).json({ donations: rows })
  } catch (error) {
    console.error('My donations error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function getDonation(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const { rows } = await pool.query(
      `SELECT d.*, d.user_id AS donor_id, p.full_name AS donor_name,
              u.created_at AS donor_created_at, u.avatar_url AS donor_avatar_url
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       JOIN users u ON u.id = d.user_id
       WHERE d.id = $1`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    const donation = rows[0]
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

    const existing = await pool.query(
      `SELECT id FROM conversations WHERE donation_id = $1 AND sender_id = $2`,
      [donation_id, user_id]
    )

    let conversation_id: number

    if (existing.rows.length > 0) {
      conversation_id = existing.rows[0].id
    } else {
      const newConv = await pool.query(
        `INSERT INTO conversations (donation_id, sender_id, recipient_id)
         VALUES ($1, $2, $3) RETURNING id`,
        [donation_id, user_id, donation.rows[0].user_id]
      )
      conversation_id = newConv.rows[0].id

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
      `SELECT d.*, p.full_name AS donor_name, w.created_at AS added_at
       FROM wishlist w
       JOIN donations d ON d.id = w.donation_id
       JOIN profiles p ON p.user_id = d.user_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.userId]
    )

    return res.status(200).json({ donations: rows })
  } catch (error) {
    console.error('My wishlist error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function deleteDonation(req: AuthRequest, res: Response) {
  const { id } = req.params

  try {
    const donation = await pool.query(
      `SELECT id, user_id FROM donations WHERE id = $1`,
      [id]
    )

    if (donation.rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    if (donation.rows[0].user_id !== req.userId) {
      return res.status(403).json({ message: 'Você não tem permissão para excluir esta doação' })
    }

    await pool.query(`DELETE FROM donations WHERE id = $1`, [id])

    return res.status(200).json({ message: 'Doação excluída com sucesso' })
  } catch (error) {
    console.error('Delete donation error:', error)
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
       LEFT JOIN conversations c ON c.donation_id = w.donation_id AND c.sender_id = w.user_id
       WHERE w.donation_id = $1
       ORDER BY w.created_at ASC`,
      [donation_id]
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

    return res.status(200).json({ donation: rows[0] })
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
