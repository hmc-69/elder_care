const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { Router } = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/authMiddleware')
const { toSafeUser } = require('../utils/safeUser')
const { loginSchema, registerSchema } = require('../validation/schemas')

const router = Router()
const BCRYPT_ROUNDS = 12

function validationError(response, error) {
  return response.status(400).json({
    message: 'Please check the submitted information.',
    errors: error.issues.map(({ path, message }) => ({ field: path.join('.'), message })),
  })
}

function issueToken(user) {
  return jwt.sign({ role: user.role }, process.env.JWT_SECRET, {
    subject: user.id,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  })
}

router.post('/register', async (request, response, next) => {
  const result = registerSchema.safeParse(request.body)
  if (!result.success) return validationError(response, result.error)

  try {
    const { name, email, phone, password, role } = result.data
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const user = await prisma.user.create({
      data: { name, email, phone: phone || null, passwordHash, role },
    })
    return response.status(201).json({ message: 'Registration successful.', user: toSafeUser(user) })
  } catch (error) {
    if (error.code === 'P2002') return response.status(409).json({ message: 'An account with this email already exists.' })
    return next(error)
  }
})

router.post('/login', async (request, response, next) => {
  const result = loginSchema.safeParse(request.body)
  if (!result.success) return validationError(response, result.error)

  try {
    const user = await prisma.user.findUnique({ where: { email: result.data.email } })
    const passwordMatches = user && await bcrypt.compare(result.data.password, user.passwordHash)
    if (!passwordMatches) return response.status(401).json({ message: 'Invalid email or password.' })

    return response.json({
      message: 'Login successful',
      token: issueToken(user),
      user: toSafeUser(user),
    })
  } catch (error) {
    return next(error)
  }
})

router.get('/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.auth.userId } })
    if (!user) return response.status(404).json({ message: 'User not found.' })
    return response.json({ user: toSafeUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.post('/logout', requireAuth, (_request, response) => {
  response.json({ message: 'Logout successful. Remove the token from the client.' })
})

module.exports = router
