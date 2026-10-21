const { Router } = require('express')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')

const router = Router()

router.get('/test', requireAuth, authorizeRoles('ADMIN'), (_request, response) => {
  response.json({ message: 'Admin access granted.' })
})

module.exports = router
