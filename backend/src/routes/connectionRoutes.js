const { Router } = require('express')
const controller = require('../controllers/connectionController')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')
const { validate } = require('../middleware/validate')
const { connectionIdSchema, connectionRequestSchema } = require('../validation/schemas')

const router = Router()

router.use(requireAuth)
router.post('/', authorizeRoles('FAMILY'), validate(connectionRequestSchema, 'body'), controller.createRequest)
router.get('/requests', authorizeRoles('ELDER'), controller.listRequests)
router.put('/:connectionId/accept', authorizeRoles('ELDER'), validate(connectionIdSchema, 'params'), controller.accept)
router.put('/:connectionId/reject', authorizeRoles('ELDER'), validate(connectionIdSchema, 'params'), controller.reject)
router.get('/family', authorizeRoles('FAMILY'), controller.listFamily)
router.get('/elder', authorizeRoles('ELDER'), controller.listElder)
router.get('/:connectionId', validate(connectionIdSchema, 'params'), controller.getDetails)
router.delete('/:connectionId', validate(connectionIdSchema, 'params'), controller.remove)

module.exports = router
