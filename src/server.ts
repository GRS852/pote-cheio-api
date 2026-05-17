import express from 'express'
import dotenv from 'dotenv'
import authRoutes from './routes/authRoutes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use('/auth', authRoutes)

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})