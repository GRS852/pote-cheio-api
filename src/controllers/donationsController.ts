import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'
import { createNotification } from '../services/notificationsService'

export async function createDonation(req: AuthRequest, res: Response) {
  const { title, description, category, photo_url, quantity } = req.body

  try {
    const { rows } = await pool.query(
      `INSERT INTO donations (user_id, title, description, category, photo_url, quantity)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, title, description, category, photo_url, quantity ?? 1]
    )

    return res.status(201).json({ donation: rows[0] })
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
      `SELECT * FROM donations WHERE user_id = $1 ORDER BY created_at DESC`,
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
      `SELECT d.*, p.full_name AS donor_name
       FROM donations d
       JOIN profiles p ON p.user_id = d.user_id
       WHERE d.id = $1`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Donation not found' })
    }

    return res.status(200).json({ donation: rows[0] })
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
        title: 'Someone wants your donation!',
        message: `A user showed interest in "${donation.rows[0].title}".`,
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
      `SELECT w.user_id, p.full_name, c.id AS conversation_id
       FROM wishlist w
       JOIN profiles p ON p.user_id = w.user_id
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

    const { rows } = await pool.query(
      `UPDATE donations SET status = 'completed' WHERE id = $1 RETURNING *`,
      [donation_id]
    )

    await pool.query(
      `INSERT INTO donation_history (donation_id, donor_id, recipient_id)
       VALUES ($1, $2, $3)`,
      [donation_id, req.userId, recipient_id]
    )

    await createNotification({
      user_id: recipient_id,
      type: 'donation',
      title: 'Doação confirmada!',
      message: `Sua solicitação de "${donation.rows[0].title}" foi aceita pelo doador.`,
      reference_id: Number(donation_id),
      reference_type: 'donation',
    })

    return res.status(200).json({ donation: rows[0] })
  } catch (error) {
    console.error('Confirm donation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
