const service = require('../services/assistantService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleError(error, response, next) {
  if (error instanceof service.AssistantServiceError) {
    return response.status(error.status).json({
      message: error.message,
      ...(error.details ? { code: error.details } : {}),
      disclaimer: service.MEDICAL_SAFETY_DISCLAIMER,
    })
  }
  return next(error)
}

const chat = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.sendMessage({
      userId: request.auth.userId,
      message: request.body.message,
      conversationId: request.body.conversationId,
    })
    return response.status(200).json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const listConversations = asyncHandler(async (request, response, next) => {
  try {
    const query = request.validatedQuery || {}
    const result = await service.getConversations({
      userId: request.auth.userId,
      page: query.page,
      limit: query.limit,
    })
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const getConversation = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.getConversationById({
      userId: request.auth.userId,
      conversationId: request.validatedId,
    })
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const updateConversation = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.updateConversation({
      userId: request.auth.userId,
      conversationId: request.validatedId,
      title: request.body.title,
    })
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const deleteConversation = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.deleteConversation({
      userId: request.auth.userId,
      conversationId: request.validatedId,
    })
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

module.exports = {
  chat,
  listConversations,
  getConversation,
  updateConversation,
  deleteConversation,
}
