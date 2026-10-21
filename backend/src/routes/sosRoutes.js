const { Router } = require('express')
const controller = require('../controllers/sosController')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')
const { validate } = require('../middleware/validate')
const {
  sosCancelSchema,
  sosHistoryQuerySchema,
  sosIdSchema,
  sosResolveSchema,
  sosTriggerSchema,
} = require('../validation/schemas')

const router = Router()

router.use(requireAuth)

// Elder-only endpoints
router.post('/', authorizeRoles('ELDER'), validate(sosTriggerSchema, 'body'), controller.trigger)
router.get('/active', authorizeRoles('ELDER'), controller.getActive)
router.get('/history', authorizeRoles('ELDER'), validate(sosHistoryQuerySchema, 'queryObject'), controller.getHistory)
router.post('/:id/cancel', authorizeRoles('ELDER'), validate(sosIdSchema, 'params'), validate(sosCancelSchema, 'body'), controller.cancel)

// Family active list
router.get('/family/active', authorizeRoles('FAMILY'), controller.familyActiveEmergencies)

// Family-only action endpoints on a specific event
router.post('/:id/acknowledge', authorizeRoles('FAMILY'), validate(sosIdSchema, 'params'), controller.acknowledge)
router.post('/:id/resolve', authorizeRoles('FAMILY'), validate(sosIdSchema, 'params'), validate(sosResolveSchema, 'body'), controller.resolve)

// Shared single-event endpoint (authorized elder owner or connected family)
router.get('/:id', validate(sosIdSchema, 'params'), controller.getOne)

module.exports = router
