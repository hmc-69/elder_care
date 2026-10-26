const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

async function requireAuth(request, response, next) {
  const authorization = request.get('authorization')
  const [scheme, token] = authorization ? authorization.split(' ') : []

  if (scheme !== 'Bearer' || !token) {
    return response.status(401).json({ message: 'Authentication required.' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return response.status(401).json({ message: 'Invalid or expired authentication token.' })
  }

  if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    return response.status(401).json({ message: 'Invalid authentication token.' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true } })
    if (!user || user.role !== payload.role) {
      return response.status(401).json({ message: 'Invalid or expired authentication token.' })
    }
    request.auth = { userId: user.id, role: user.role }
    return next()
  } catch (error) {
    return next(error)
  }
}

module.exports = { requireAuth }
