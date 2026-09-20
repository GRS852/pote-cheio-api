import express from 'express'
import http from 'http'
import dotenv from 'dotenv'
import cors from 'cors'
import authRoutes from './routes/authRoutes'
import conversationsRoutes from './routes/conversationsRoutes'
import donationsRoutes from './routes/donationsRoutes'
import feedRoutes from './routes/feedRoutes'
import notificationsRoutes from './routes/notificationsRoutes'
import historyRoutes from './routes/historyRoutes'
import reportsRoutes from './routes/reportsRoutes'
import adminRoutes from './routes/adminRoutes'
import usersRoutes from './routes/usersRoutes'
import { purgeExpiredAccounts } from './controllers/adminController'
import { autoFinalizeStaleTransactions } from './controllers/donationTransactionController'
import { releaseExpiredReservations } from './controllers/donationsController'
import { initSocket } from './socket'

dotenv.config()

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 3000

app.use(cors({
  origin: 'https://potecheio.site',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())

app.use('/auth', authRoutes)
app.use('/donations', donationsRoutes)
app.use('/feed', feedRoutes)
app.use('/conversations', conversationsRoutes)
app.use('/notifications', notificationsRoutes)
app.use('/history', historyRoutes)
app.use('/reports', reportsRoutes)
app.use('/admin', adminRoutes)
app.use('/users', usersRoutes)

initSocket(httpServer)

// Roda uma vez ao subir e depois a cada 24h: remove de vez contas desativadas
// há mais de 30 dias (a exclusão em si já é imediata a nível de acesso —
// isso só limpa o registro depois do prazo de carência).
const ONE_DAY_MS = 24 * 60 * 60 * 1000
purgeExpiredAccounts()
setInterval(purgeExpiredAccounts, ONE_DAY_MS)

// Roda uma vez ao subir e depois a cada hora: finaliza sozinha qualquer
// transação enviada há mais de 7 dias sem confirmação de nenhuma das partes.
const ONE_HOUR_MS = 60 * 60 * 1000
autoFinalizeStaleTransactions()
setInterval(autoFinalizeStaleTransactions, ONE_HOUR_MS)

// Mesma cadência: libera sozinha qualquer reserva "leve" (feita ao clicar
// em Reservar) vencida há mais de 3 dias sem o doador confirmar ou desreservar.
releaseExpiredReservations()
setInterval(releaseExpiredReservations, ONE_HOUR_MS)

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
