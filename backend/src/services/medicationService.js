const prisma = require('../lib/prisma')

const MISSED_GRACE_MINUTES = 60
const frequencyCounts = { ONCE_DAILY: 1, TWICE_DAILY: 2, THREE_TIMES_DAILY: 3 }

class MedicationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function localDateTime(now = new Date()) {
  const timeZone = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` }
}

function currentScheduleDate(now = new Date()) {
  return localDateTime(now).date
}

function dateValue(value) {
  if (!value) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function dbDate(value) {
  return new Date(`${value}T00:00:00.000Z`)
}

function minuteOfDay(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function validateSchedule(frequency, times) {
  if (!Array.isArray(times) || times.length < 1 || times.length > 8) {
    throw new MedicationError(400, 'Add between 1 and 8 scheduled times.')
  }
  if (new Set(times).size !== times.length) throw new MedicationError(400, 'Scheduled times must be unique.')
  if (frequencyCounts[frequency] && frequencyCounts[frequency] !== times.length) {
    throw new MedicationError(400, `${frequency.replaceAll('_', ' ').toLowerCase()} requires ${frequencyCounts[frequency]} scheduled time${frequencyCounts[frequency] === 1 ? '' : 's'}.`)
  }
}

function publicMedication(medication) {
  return {
    id: medication.id,
    name: medication.name,
    dosage: medication.dosage,
    instructions: medication.instructions,
    frequency: medication.frequency,
    times: medication.times,
    startDate: dateValue(medication.startDate),
    endDate: dateValue(medication.endDate),
    active: medication.active,
    createdAt: medication.createdAt,
    updatedAt: medication.updatedAt,
  }
}

function statusForLog(log, now = new Date()) {
  if (log.status !== 'PENDING') return log.status
  const current = localDateTime(now)
  if (dateValue(log.scheduledDate) !== current.date) return 'MISSED'
  const elapsed = minuteOfDay(current.time) - minuteOfDay(log.scheduledTime)
  if (elapsed >= MISSED_GRACE_MINUTES) return 'MISSED'
  if (elapsed >= 0) return 'DUE'
  return 'PENDING'
}

async function ensureDayLogs(medications, date, now = new Date()) {
  if (!medications.length) return []
  const dateObj = dbDate(date)
  const inRange = medications.filter((medication) => {
    const start = dateValue(medication.startDate)
    const end = dateValue(medication.endDate)
    return medication.active && start <= date && (!end || end >= date)
  })
  if (!inRange.length) return []

  await prisma.medicationLog.createMany({
    data: inRange.flatMap((medication) => medication.times.map((scheduledTime) => ({
      medicationId: medication.id, scheduledDate: dateObj, scheduledTime,
    }))),
    skipDuplicates: true,
  })

  const logs = await prisma.medicationLog.findMany({
    where: { medicationId: { in: inRange.map(({ id }) => id) }, scheduledDate: dateObj },
    orderBy: [{ scheduledTime: 'asc' }],
  })
  const current = localDateTime(now)
  if (date === current.date) {
    const expired = logs.filter((log) => log.status === 'PENDING' && minuteOfDay(current.time) - minuteOfDay(log.scheduledTime) >= MISSED_GRACE_MINUTES)
    await Promise.all(expired.map((log) => prisma.medicationLog.updateMany({
      where: { id: log.id, status: 'PENDING' }, data: { status: 'MISSED' },
    })))
    for (const log of expired) log.status = 'MISSED'
  }
  return logs
}

async function createMedication(elderId, input) {
  validateSchedule(input.frequency, input.times)
  if (input.endDate && input.endDate < input.startDate) throw new MedicationError(400, 'End date cannot be before start date.')
  const medication = await prisma.medication.create({ data: {
    elderId, name: input.name, dosage: input.dosage,
    instructions: input.instructions || null,
    frequency: input.frequency, times: input.times,
    startDate: dbDate(input.startDate), endDate: input.endDate ? dbDate(input.endDate) : null,
  } })
  return publicMedication(medication)
}

async function listMedications(elderId, { includeInactive = true } = {}) {
  const medications = await prisma.medication.findMany({
    where: { elderId, ...(includeInactive ? {} : { active: true }) },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })
  return medications.map(publicMedication)
}

async function getElderToday(elderId, now = new Date()) {
  const { date } = localDateTime(now)
  const medications = await prisma.medication.findMany({
    where: { elderId, active: true, startDate: { lte: dbDate(date) }, OR: [{ endDate: null }, { endDate: { gte: dbDate(date) } }] },
  })
  const logs = await ensureDayLogs(medications, date, now)
  const byId = new Map(medications.map((medication) => [medication.id, medication]))
  return logs.map((log) => ({
    id: log.id,
    medication: publicMedication(byId.get(log.medicationId)),
    scheduledDate: dateValue(log.scheduledDate),
    scheduledTime: log.scheduledTime,
    status: statusForLog(log, now),
    takenAt: log.takenAt,
  })).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime) || a.medication.name.localeCompare(b.medication.name))
}

async function getMedicationRecord(medicationId) {
  const medication = await prisma.medication.findUnique({ where: { id: medicationId } })
  if (!medication) throw new MedicationError(404, 'Medication not found.')
  return medication
}

async function authorizeRead(medicationId, userId, role) {
  const medication = await getMedicationRecord(medicationId)
  if (role === 'ELDER' && medication.elderId === userId) return medication
  if (role === 'FAMILY') {
    const accepted = await prisma.familyConnection.findFirst({
      where: { familyId: userId, elderId: medication.elderId, status: 'ACCEPTED' }, select: { id: true },
    })
    if (accepted) return medication
  }
  throw new MedicationError(404, 'Medication not found.')
}

async function getMedication(medicationId, userId, role) {
  return publicMedication(await authorizeRead(medicationId, userId, role))
}

async function updateMedication(medicationId, elderId, input) {
  const existing = await getMedicationRecord(medicationId)
  if (existing.elderId !== elderId) throw new MedicationError(404, 'Medication not found.')
  const next = { ...existing, ...input }
  const startDate = dateValue(next.startDate)
  const endDate = dateValue(next.endDate)
  if (endDate && endDate < startDate) throw new MedicationError(400, 'End date cannot be before start date.')
  validateSchedule(next.frequency, next.times)
  const data = { ...input }
  if (input.startDate) data.startDate = dbDate(input.startDate)
  if (input.endDate !== undefined) data.endDate = input.endDate ? dbDate(input.endDate) : null
  const medication = await prisma.medication.update({ where: { id: medicationId }, data })
  return publicMedication(medication)
}

async function deactivateMedication(medicationId, elderId) {
  const result = await prisma.medication.updateMany({ where: { id: medicationId, elderId }, data: { active: false } })
  if (result.count !== 1) throw new MedicationError(404, 'Medication not found.')
  return publicMedication(await getMedicationRecord(medicationId))
}

async function markTaken(medicationId, elderId, now = new Date()) {
  const medication = await getMedicationRecord(medicationId)
  if (medication.elderId !== elderId) throw new MedicationError(404, 'Medication not found.')
  if (!medication.active) throw new MedicationError(409, 'This medication is inactive.')
  const { date, time } = localDateTime(now)
  const today = dbDate(date)
  if (dateValue(medication.startDate) > date || (medication.endDate && dateValue(medication.endDate) < date)) {
    throw new MedicationError(409, 'This medication is not scheduled for today.')
  }
  const logs = await ensureDayLogs([medication], date, now)
  const currentMinute = minuteOfDay(time)
  const due = logs.filter((log) => log.status === 'PENDING')
    .filter((log) => currentMinute >= minuteOfDay(log.scheduledTime) && currentMinute - minuteOfDay(log.scheduledTime) < MISSED_GRACE_MINUTES)
    .sort((a, b) => minuteOfDay(a.scheduledTime) - minuteOfDay(b.scheduledTime))[0]
  if (!due) throw new MedicationError(409, 'There is no medication dose due right now.')
  const result = await prisma.medicationLog.updateMany({
    where: { id: due.id, medicationId, scheduledDate: today, status: 'PENDING' },
    data: { status: 'TAKEN', takenAt: now },
  })
  if (result.count !== 1) throw new MedicationError(409, 'This dose has already been recorded.')
  return {
    id: due.id, medication: publicMedication(medication), scheduledDate: date,
    scheduledTime: due.scheduledTime, status: 'TAKEN', takenAt: now,
  }
}

async function getMedicationLogs(medicationId, userId, role) {
  const medication = await authorizeRead(medicationId, userId, role)
  const logs = await prisma.medicationLog.findMany({
    where: { medicationId }, orderBy: [{ scheduledDate: 'desc' }, { scheduledTime: 'desc' }],
  })
  return { medication: publicMedication(medication), logs: logs.map((log) => ({
    id: log.id, scheduledDate: dateValue(log.scheduledDate), scheduledTime: log.scheduledTime,
    status: statusForLog(log), takenAt: log.takenAt, createdAt: log.createdAt,
  })) }
}

async function getFamilyMedicationView(familyId, elderId, now = new Date()) {
  const connection = await prisma.familyConnection.findFirst({
    where: { familyId, elderId, status: 'ACCEPTED' }, select: { id: true },
  })
  if (!connection) throw new MedicationError(404, 'Connected elder not found.')
  const elder = await prisma.user.findFirst({
    where: { id: elderId, role: 'ELDER' }, select: { id: true, name: true },
  })
  if (!elder) throw new MedicationError(404, 'Connected elder not found.')
  const medications = await listMedications(elderId, { includeInactive: false })
  const today = await getElderToday(elderId, now)
  return { elder, medications, today }
}

module.exports = {
  MedicationError,
  createMedication,
  currentScheduleDate,
  deactivateMedication,
  getElderToday,
  getFamilyMedicationView,
  getMedication,
  getMedicationLogs,
  listMedications,
  markTaken,
  publicMedication,
  statusForLog,
  updateMedication,
}
