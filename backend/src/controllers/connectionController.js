const service = require('../services/connectionService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleServiceError(error, response, next) {
  if (error instanceof service.ConnectionError) {
    return response.status(error.status).json({ message: error.message })
  }
  return next(error)
}

const searchElders = asyncHandler(async (request, response, next) => {
  try {
    const users = await service.searchElders(request.validatedQuery)
    return response.json({ users })
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const createRequest = asyncHandler(async (request, response, next) => {
  try {
    const connection = await service.createRequest(request.auth.userId, request.body.elderId, request.body.relationship)
    return response.status(201).json({ message: 'Connection request sent', connection: service.publicConnection(connection) })
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const listRequests = asyncHandler(async (request, response, next) => {
  try {
    return response.json(await service.listRequests(request.auth.userId))
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

function respond(status) {
  return asyncHandler(async (request, response, next) => {
    try {
      const connection = await service.respondToRequest(request.validatedId, request.auth.userId, status)
      return response.json({ message: `Connection request ${status.toLowerCase()}.`, connection: service.publicConnection(connection) })
    } catch (error) {
      return handleServiceError(error, response, next)
    }
  })
}

const listFamily = asyncHandler(async (request, response, next) => {
  try {
    return response.json(await service.listFamilyConnections(request.auth.userId))
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const listElder = asyncHandler(async (request, response, next) => {
  try {
    return response.json(await service.listElderConnections(request.auth.userId))
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const getDetails = asyncHandler(async (request, response, next) => {
  try {
    const connection = await service.getConnectionDetails(request.validatedId, request.auth.userId)
    return response.json({ connection })
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const remove = asyncHandler(async (request, response, next) => {
  try {
    const connection = await service.removeConnection(request.validatedId, request.auth.userId)
    return response.json({ message: 'Connection removed.', connection: service.publicConnection(connection) })
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

const getConnectedElder = asyncHandler(async (request, response, next) => {
  try {
    const elder = await service.getConnectedElderProfile(request.auth.userId, request.validatedId)
    return response.json({ elder })
  } catch (error) {
    return handleServiceError(error, response, next)
  }
})

module.exports = {
  createRequest,
  getConnectedElder,
  getDetails,
  listElder,
  listFamily,
  listRequests,
  reject: respond('REJECTED'),
  accept: respond('ACCEPTED'),
  remove,
  searchElders,
}
