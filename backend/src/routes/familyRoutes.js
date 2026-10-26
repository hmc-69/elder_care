const { Router } = require('express')
const { getConnectedElder, searchElders } = require('../controllers/connectionController')
const medicationController = require('../controllers/medicationController')
const checkInController = require('../controllers/checkInController')
const sosController = require('../controllers/sosController')
const { getFamilyDashboardSummary } = require('../services/familyDashboardService')
const { asyncHandler } = require('../utils/asyncHandler')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')
const { validate } = require('../middleware/validate')
const { connectionIdSchema, searchEldersSchema, sosHistoryQuerySchema } = require('../validation/schemas')

const router = Router()

router.use(requireAuth, authorizeRoles('FAMILY'))
router.get('/dashboard', asyncHandler(async (request, response) => {
  const summary = await getFamilyDashboardSummary(request.auth.userId)
  return response.json(summary)
}))
router.get('/elders/search', validate(searchEldersSchema, 'query'), searchElders)
router.get('/elders/:elderId/medications', validate(connectionIdSchema, 'params'), medicationController.familyView)
router.get('/elders/:elderId/checkins', validate(connectionIdSchema, 'params'), checkInController.familyView)
router.get('/elders/:elderId/sos', validate(connectionIdSchema, 'params'), validate(sosHistoryQuerySchema, 'queryObject'), sosController.familyElderSos)
router.get('/elders/:elderId', validate(connectionIdSchema, 'params'), getConnectedElder)

module.exports = router
