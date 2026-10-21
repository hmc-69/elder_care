require('dotenv').config()

const cors = require('cors')
const express = require('express')
const authRoutes = require('./routes/authRoutes')
const userRoutes = require('./routes/userRoutes')
const adminRoutes = require('./routes/adminRoutes')
const connectionRoutes = require('./routes/connectionRoutes')
const familyRoutes = require('./routes/familyRoutes')
const medicationRoutes = require('./routes/medicationRoutes')
const checkInRoutes = require('./routes/checkInRoutes')
const sosRoutes = require('./routes/sosRoutes')
const assistantRoutes = require('./routes/assistantRoutes')
const prisma = require('./lib/prisma')

const app = express()
const port = Number(process.env.PORT) || 8000
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace_me_')) {
  throw new Error('Set a private JWT_SECRET of at least 32 characters in backend/.env.')
}

app.use(cors({ origin: frontendOrigin }))
app.use(express.json({ limit: '20kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'ElderCare Connect API' })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/connections', connectionRoutes)
app.use('/api/medications', medicationRoutes)
app.use('/api/checkins', checkInRoutes)
app.use('/api/sos', sosRoutes)
app.use('/api/family', familyRoutes)
app.use('/api/assistant', assistantRoutes)


app.use((request, response) => response.status(404).json({ message: 'Route not found.' }))

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ message: 'Request body must be valid JSON.' })
  }
  console.error('Unhandled API error:', error.code || error.name || 'UnknownError')
  return response.status(500).json({ message: 'Internal server error.' })
})

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`ElderCare Connect API listening on http://localhost:${port}`)
  })

  async function shutdown() {
    server.close(async () => {
      await prisma.$disconnect()
      process.exit(0)
    })
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

module.exports = app
