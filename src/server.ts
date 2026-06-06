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

initSocket(httpServer)

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
