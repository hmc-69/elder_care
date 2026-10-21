const service = require('../services/notificationService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleError(error, response, next) {
  if (error instanceof service.NotificationError) {
    return response.status(error.status).json({ message: error.message })
  }
  return next(error)
}

const list = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.getNotifications(request.auth.userId, request.validatedQuery)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const unreadCount = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.getUnreadCount(request.auth.userId)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const markRead = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.markAsRead(request.validatedId, request.auth.userId)
    return response.json({ message: 'Notification marked as read.', notification: result })
  } catch (error) {
    return handleError(error, response, next)
  }
})

const markAllRead = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.markAllAsRead(request.auth.userId)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const remove = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.deleteNotification(request.validatedId, request.auth.userId)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

module.exports = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  remove,
}
