const service = require('../services/checkInService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleError(error, response, next) {
  if (error instanceof service.CheckInError) {
    return response.status(error.status).json({ message: error.message, ...(error.checkIn ? { checkIn: error.checkIn } : {}) })
  }
  return next(error)
}

const today = asyncHandler(async (request, response, next) => {
  try { return response.json({ checkIns: await service.getToday(request.auth.userId) }) }
  catch (error) { return handleError(error, response, next) }
})

const completeToday = asyncHandler(async (request, response, next) => {
  try { return response.json({ message: 'Check-in completed successfully.', checkIn: await service.completeToday(request.auth.userId, request.body.period) }) }
  catch (error) { return handleError(error, response, next) }
})

const history = asyncHandler(async (request, response, next) => {
  try { return response.json({ history: await service.getHistory(request.auth.userId, request.validatedQuery) }) }
  catch (error) { return handleError(error, response, next) }
})

const getOne = asyncHandler(async (request, response, next) => {
  try { return response.json({ checkIn: await service.getOne(request.validatedId, request.auth.userId) }) }
  catch (error) { return handleError(error, response, next) }
})

const familyView = asyncHandler(async (request, response, next) => {
  try { return response.json(await service.getFamilyCheckIns(request.auth.userId, request.validatedId)) }
  catch (error) { return handleError(error, response, next) }
})

module.exports = { completeToday, familyView, getOne, history, today }
