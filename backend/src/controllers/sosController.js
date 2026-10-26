const service = require('../services/sosService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleError(error, response, next) {
  if (error instanceof service.SosError) {
    return response.status(error.status).json({
      message: error.message,
      ...(error.event ? { event: error.event } : {}),
      disclaimer: service.SOS_DISCLAIMER,
    })
  }
  return next(error)
}

const trigger = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.triggerSos(request.auth.userId, request.body)
    return response.status(201).json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const getActive = asyncHandler(async (request, response, next) => {
  try {
    const event = await service.getActiveElderSos(request.auth.userId)
    return response.json({ event, disclaimer: service.SOS_DISCLAIMER })
  } catch (error) {
    return handleError(error, response, next)
  }
})

const getHistory = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.getElderSosHistory(request.auth.userId, request.validatedQuery)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const getOne = asyncHandler(async (request, response, next) => {
  try {
    const event = await service.getEventById(request.validatedId, request.auth)
    return response.json({ event, disclaimer: service.SOS_DISCLAIMER })
  } catch (error) {
    return handleError(error, response, next)
  }
})

const cancel = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.cancelSos(request.validatedId, request.auth.userId, request.body)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const acknowledge = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.acknowledgeSos(request.validatedId, request.auth.userId)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const resolve = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.resolveSos(request.validatedId, request.auth.userId, request.body)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const familyElderSos = asyncHandler(async (request, response, next) => {
  try {
    const result = await service.getFamilyElderSos(request.auth.userId, request.validatedId, request.validatedQuery)
    return response.json(result)
  } catch (error) {
    return handleError(error, response, next)
  }
})

const familyActiveEmergencies = asyncHandler(async (request, response, next) => {
  try {
    const events = await service.getFamilyActiveEmergencies(request.auth.userId)
    return response.json({ events, disclaimer: service.SOS_DISCLAIMER })
  } catch (error) {
    return handleError(error, response, next)
  }
})

module.exports = {
  acknowledge,
  cancel,
  familyActiveEmergencies,
  familyElderSos,
  getActive,
  getHistory,
  getOne,
  resolve,
  trigger,
}
