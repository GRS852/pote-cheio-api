import { Response } from 'express'
import pool from '../db'
import { AuthRequest } from '../middlewares/authMiddleware'

export async function donationsMade(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, d.title, d.category, d.photo_url,
              p.full_name AS recipient_name
       FROM donation_history h
       JOIN donations d ON d.id = h.donation_id
       JOIN profiles p ON p.user_id = h.recipient_id
       WHERE h.donor_id = $1
       ORDER BY h.donated_at DESC`,
      [req.userId]
    )

    return res.status(200).json({ history: rows })
  } catch (error) {
    console.error('Donations made error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

export async function donationsReceived(req: AuthRequest, res: Response) {
  try {
    const { rows } = await pool.query(
      `SELECT h.*, d.title, d.category, d.photo_url,
              p.full_name AS donor_name
       FROM donation_history h
       JOIN donations d ON d.id = h.donation_id
       JOIN profiles p ON p.user_id = h.donor_id
       WHERE h.recipient_id = $1
       ORDER BY h.donated_at DESC`,
      [req.userId]
    )

    return res.status(200).json({ history: rows })
  } catch (error) {
    console.error('Donations received error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
