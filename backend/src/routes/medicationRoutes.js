const { Router } = require('express')
const controller = require('../controllers/medicationController')
const { requireAuth } = require('../middleware/authMiddleware')
const { authorizeRoles } = require('../middleware/authorizeRoles')
const { validate } = require('../middleware/validate')
const { medicationCreateSchema, medicationIdSchema, medicationUpdateSchema } = require('../validation/schemas')

const router = Router()
router.use(requireAuth)

router.post('/', authorizeRoles('ELDER'), validate(medicationCreateSchema, 'body'), controller.create)
router.get('/', authorizeRoles('ELDER', 'FAMILY'), controller.list)
router.get('/today', authorizeRoles('ELDER'), controller.today)
router.get('/:medicationId/logs', authorizeRoles('ELDER', 'FAMILY'), validate(medicationIdSchema, 'params'), controller.logs)
router.post('/:medicationId/taken', authorizeRoles('ELDER'), validate(medicationIdSchema, 'params'), controller.taken)
router.get('/:medicationId', authorizeRoles('ELDER', 'FAMILY'), validate(medicationIdSchema, 'params'), controller.getOne)
router.put('/:medicationId', authorizeRoles('ELDER'), validate(medicationIdSchema, 'params'), validate(medicationUpdateSchema, 'body'), controller.update)
router.delete('/:medicationId', authorizeRoles('ELDER'), validate(medicationIdSchema, 'params'), controller.deactivate)

module.exports = router
