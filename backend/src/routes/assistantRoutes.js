const { Router } = require('express')
const controller = require('../controllers/assistantController')
const { requireAuth } = require('../middleware/authMiddleware')
const { validate } = require('../middleware/validate')
const {
  chatMessageSchema,
  conversationIdSchema,
  conversationUpdateSchema,
  conversationHistoryQuerySchema,
} = require('../validation/schemas')

const router = Router()

router.use(requireAuth)

router.post('/chat', validate(chatMessageSchema, 'body'), controller.chat)
router.get('/conversations', validate(conversationHistoryQuerySchema, 'queryObject'), controller.listConversations)
router.get('/conversations/:id', validate(conversationIdSchema, 'params'), controller.getConversation)
router.patch(
  '/conversations/:id',
  validate(conversationIdSchema, 'params'),
  validate(conversationUpdateSchema, 'body'),
  controller.updateConversation
)
router.delete('/conversations/:id', validate(conversationIdSchema, 'params'), controller.deleteConversation)

module.exports = router
