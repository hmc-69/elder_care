const { Router } = require('express')
const controller = require('../controllers/checkInController')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')
const { validate } = require('../middleware/validate')
const { checkInCompletionSchema, checkInHistorySchema, connectionIdSchema } = require('../validation/schemas')

const router = Router()
router.use(requireAuth, authorizeRoles('ELDER'))
router.get('/today', controller.today)
router.post('/today', validate(checkInCompletionSchema, 'body'), controller.completeToday)
router.get('/history', validate(checkInHistorySchema, 'queryObject'), controller.history)
router.get('/:checkInId', validate(connectionIdSchema, 'params'), controller.getOne)

module.exports = router
