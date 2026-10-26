const { Router } = require('express')
const controller = require('../controllers/notificationController')
const { requireAuth } = require('../middleware/authMiddleware')
const { validate } = require('../middleware/validate')
const { notificationIdSchema, notificationListQuerySchema } = require('../validation/schemas')

const router = Router()

router.use(requireAuth)

router.get('/', validate(notificationListQuerySchema, 'queryObject'), controller.list)
router.get('/unread-count', controller.unreadCount)
router.patch('/:id/read', validate(notificationIdSchema, 'params'), controller.markRead)
router.patch('/mark-all-read', controller.markAllRead)
router.delete('/:id', validate(notificationIdSchema, 'params'), controller.remove)

module.exports = router
