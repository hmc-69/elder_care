const service = require('../services/medicationService')
const { asyncHandler } = require('../utils/asyncHandler')

function handleError(error, response, next) {
  if (error instanceof service.MedicationError) return response.status(error.status).json({ message: error.message })
  return next(error)
}

const create = asyncHandler(async (request, response, next) => {
  try {
    const medication = await service.createMedication(request.auth.userId, request.body)
    return response.status(201).json({ message: 'Medication added successfully.', medication })
  } catch (error) { return handleError(error, response, next) }
})

const list = asyncHandler(async (request, response, next) => {
  try {
    if (request.auth.role === 'FAMILY') {
      const elderId = typeof request.query.elderId === 'string' ? request.query.elderId.trim() : ''
      if (!elderId || elderId.length > 191) return response.status(400).json({ message: 'Provide an elderId to view connected medications.' })
      const view = await service.getFamilyMedicationView(request.auth.userId, elderId)
      return response.json({ medications: view.medications })
    }
    return response.json({ medications: await service.listMedications(request.auth.userId) })
  } catch (error) { return handleError(error, response, next) }
})

const today = asyncHandler(async (request, response, next) => {
  try {
    const medications = await service.getElderToday(request.auth.userId)
    return response.json({ date: service.currentScheduleDate(), medications })
  } catch (error) { return handleError(error, response, next) }
})

const getOne = asyncHandler(async (request, response, next) => {
  try {
    const medication = await service.getMedication(request.validatedId, request.auth.userId, request.auth.role)
    return response.json({ medication })
  } catch (error) { return handleError(error, response, next) }
})

const update = asyncHandler(async (request, response, next) => {
  try {
    const medication = await service.updateMedication(request.validatedId, request.auth.userId, request.body)
    return response.json({ message: 'Medication updated successfully.', medication })
  } catch (error) { return handleError(error, response, next) }
})

const deactivate = asyncHandler(async (request, response, next) => {
  try {
    const medication = await service.deactivateMedication(request.validatedId, request.auth.userId)
    return response.json({ message: 'Medication deactivated. Its history has been kept.', medication })
  } catch (error) { return handleError(error, response, next) }
})

const taken = asyncHandler(async (request, response, next) => {
  try {
    const event = await service.markTaken(request.validatedId, request.auth.userId)
    return response.json({ message: 'Medication marked as taken.', event })
  } catch (error) { return handleError(error, response, next) }
})

const logs = asyncHandler(async (request, response, next) => {
  try {
    return response.json(await service.getMedicationLogs(request.validatedId, request.auth.userId, request.auth.role))
  } catch (error) { return handleError(error, response, next) }
})

const familyView = asyncHandler(async (request, response, next) => {
  try {
    const view = await service.getFamilyMedicationView(request.auth.userId, request.validatedId)
    return response.json(view)
  } catch (error) { return handleError(error, response, next) }
})

module.exports = { create, deactivate, familyView, getOne, list, logs, taken, today, update }
