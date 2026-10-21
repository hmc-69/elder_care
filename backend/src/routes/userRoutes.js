const bcrypt = require('bcryptjs')
const { Router } = require('express')
const prisma = require('../lib/prisma')
const { requireAuth } = require('../middleware/authMiddleware')
const { toSafeUser } = require('../utils/safeUser')
const { changePasswordSchema, profileSchema } = require('../validation/schemas')

const router = Router()

function validationError(response, error) {
  return response.status(400).json({
    message: 'Please check the submitted information.',
    errors: error.issues.map(({ path, message }) => ({ field: path.join('.'), message })),
  })
}

router.use(requireAuth)

router.get('/me', async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: request.auth.userId } })
    if (!user) return response.status(404).json({ message: 'User not found.' })
    return response.json({ user: toSafeUser(user) })
  } catch (error) {
    return next(error)
  }
})

router.put('/me', async (request, response, next) => {
  const result = profileSchema.safeParse(request.body)
  if (!result.success) return validationError(response, result.error)

  try {
    const data = { ...result.data }
    if (data.phone === '') data.phone = null
    const user = await prisma.user.update({ where: { id: request.auth.userId }, data })
    return response.json({ message: 'Profile updated successfully.', user: toSafeUser(user) })
  } catch (error) {
    if (error.code === 'P2025') return response.status(404).json({ message: 'User not found.' })
    return next(error)
  }
})

router.put('/me/password', async (request, response, next) => {
  const result = changePasswordSchema.safeParse(request.body)
  if (!result.success) return validationError(response, result.error)

  try {
    const user = await prisma.user.findUnique({ where: { id: request.auth.userId } })
    if (!user) return response.status(404).json({ message: 'User not found.' })
    if (!await bcrypt.compare(result.data.currentPassword, user.passwordHash)) {
      return response.status(400).json({ message: 'Current password is incorrect.' })
    }

    const passwordHash = await bcrypt.hash(result.data.newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    return response.json({ message: 'Password changed successfully.' })
  } catch (error) {
    return next(error)
  }
})

module.exports = router
