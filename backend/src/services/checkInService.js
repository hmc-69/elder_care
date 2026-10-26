const prisma = require('../lib/prisma')
const notificationService = require('./notificationService')

const HISTORY_DAYS = 30
const MAX_HISTORY_DAYS = 90

class CheckInError extends Error {
  constructor(status, message, checkIn) {
    super(message)
    this.status = status
    this.checkIn = checkIn
  }
}

function settings() {
  const schedules = [
    { period: 'MORNING', scheduledTime: process.env.CHECKIN_MORNING_TIME || process.env.CHECKIN_TIME || '09:00' },
    { period: 'NIGHT', scheduledTime: process.env.CHECKIN_NIGHT_TIME || '20:00' },
  ]
  const graceText = process.env.CHECKIN_GRACE_MINUTES || '60'
  const graceMinutes = Number(graceText)
  if (schedules.some(({ scheduledTime }) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(scheduledTime))
    || minutes(schedules[0].scheduledTime) >= minutes(schedules[1].scheduledTime)
    || !/^\d+$/.test(graceText) || !Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 1440) {
    throw new CheckInError(500, 'Check-in schedule is not configured correctly.')
  }
  return { schedules, graceMinutes }
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

function dateValue(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function dbDate(value) {
  return new Date(`${value}T00:00:00.000Z`)
}

function addDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10)
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

function toPublic(checkIn, now = new Date()) {
  const { date: today, time: currentTime } = localDateTime(now)
  const { schedules, graceMinutes } = settings()
  const scheduledTime = checkIn.scheduledTime || schedules.find((item) => item.period === checkIn.period)?.scheduledTime
  const checkinDate = dateValue(checkIn.checkinDate)
  const completedAt = checkIn.checkedInAt ? localDateTime(checkIn.checkedInAt) : null
  const late = checkIn.status === 'COMPLETED' && completedAt?.date === checkinDate
    && minutes(completedAt.time) >= minutes(checkIn.scheduledTime) + graceMinutes
  return {
    id: checkIn.id,
    date: checkinDate,
    period: checkIn.period || 'MORNING',
    scheduledTime,
    status: checkIn.status,
    isDue: checkIn.status === 'PENDING' && checkinDate === today && minutes(currentTime) >= minutes(checkIn.scheduledTime || scheduledTime),
    late,
    checkedInAt: checkIn.checkedInAt,
    createdAt: checkIn.createdAt,
    updatedAt: checkIn.updatedAt,
  }
}

async function findElder(elderId) {
  const elder = await prisma.user.findFirst({
    where: { id: elderId, role: 'ELDER' }, select: { id: true, name: true, createdAt: true },
  })
  if (!elder) throw new CheckInError(404, 'Check-in information not found.')
  return elder
}

async function reconcileRange(elderId, requestedStart, requestedEnd, now = new Date()) {
  const { date: today } = localDateTime(now)
  const { schedules, graceMinutes } = settings()
  if (requestedEnd > today) throw new CheckInError(400, 'Check-in history cannot include future dates.')
  const span = Math.floor((Date.parse(`${requestedEnd}T00:00:00Z`) - Date.parse(`${requestedStart}T00:00:00Z`)) / 86400000) + 1
  if (span < 1 || span > MAX_HISTORY_DAYS) throw new CheckInError(400, `Choose a date range of ${MAX_HISTORY_DAYS} days or fewer.`)

  const elder = await findElder(elderId)
  const accountDate = localDateTime(elder.createdAt).date
  const start = requestedStart < accountDate ? accountDate : requestedStart
  if (start > requestedEnd) return []

  const dates = []
  for (let date = start; date <= requestedEnd; date = addDays(date, 1)) dates.push(date)
  await prisma.checkIn.createMany({
    data: dates.flatMap((date) => schedules.map(({ period, scheduledTime }) => ({ elderId, checkinDate: dbDate(date), period, scheduledTime }))),
    skipDuplicates: true,
  })

  await prisma.checkIn.updateMany({
    where: { elderId, checkinDate: { lt: dbDate(today) }, status: 'PENDING' },
    data: { status: 'MISSED' },
  })
  const currentTime = localDateTime(now).time
  for (const schedule of schedules) {
    if (minutes(currentTime) < minutes(schedule.scheduledTime) + graceMinutes) continue
    await prisma.checkIn.updateMany({
      where: { elderId, checkinDate: dbDate(today), period: schedule.period, status: 'PENDING' },
      data: { status: 'MISSED' },
    })
  }

  // Idempotently notify connected family of missed check-in on today
  const missedRows = await prisma.checkIn.findMany({
    where: { elderId, checkinDate: dbDate(today), status: 'MISSED' },
    select: { id: true, period: true },
  })
  if (missedRows.length > 0) {
    const elder = await prisma.user.findUnique({ where: { id: elderId }, select: { name: true } }).catch(() => null)
    for (const missed of missedRows) {
      await notificationService.notifyConnectedFamily({
        elderId,
        type: 'CHECKIN_MISSED',
        title: 'Missed Daily Check-in',
        message: `${elder?.name || 'Your connected elder'} missed their scheduled ${missed.period.toLowerCase()} check-in.`,
        relatedEntityType: 'CHECKIN',
        relatedEntityId: missed.id,
      }).catch(() => {})
    }
  }

  return prisma.checkIn.findMany({
    where: { elderId, checkinDate: { gte: dbDate(start), lte: dbDate(requestedEnd) } },
    orderBy: { checkinDate: 'desc' },
  })
}

async function getToday(elderId, now = new Date()) {
  const { date } = localDateTime(now)
  const checkIns = await reconcileRange(elderId, date, date, now)
  if (!checkIns.length) throw new CheckInError(404, 'Check-in information not found.')
  return checkIns.map((checkIn) => toPublic(checkIn, now))
}

async function completeToday(elderId, period, now = new Date()) {
  if (!['MORNING', 'NIGHT'].includes(period)) throw new CheckInError(400, 'Choose a morning or night check-in.')
  const { date } = localDateTime(now)
  const checkIns = await reconcileRange(elderId, date, date, now)
  const checkIn = checkIns.find((item) => item.period === period)
  if (!checkIn) throw new CheckInError(404, 'Check-in information not found.')
  if (checkIn.status === 'COMPLETED') {
    throw new CheckInError(409, "Today's check-in is already completed.", toPublic(checkIn, now))
  }
  const result = await prisma.checkIn.updateMany({
    where: { id: checkIn.id, elderId, status: { in: ['PENDING', 'MISSED'] } },
    data: { status: 'COMPLETED', checkedInAt: now },
  })
  if (result.count !== 1) {
    const latest = await prisma.checkIn.findUnique({ where: { id: checkIn.id } })
    if (latest?.status === 'COMPLETED') throw new CheckInError(409, "Today's check-in is already completed.", toPublic(latest, now))
    throw new CheckInError(409, "Today's check-in could not be completed. Please try again.")
  }
  const completed = await prisma.checkIn.findUnique({ where: { id: checkIn.id } })

  const elder = await prisma.user.findUnique({ where: { id: elderId }, select: { name: true } }).catch(() => null)
  await notificationService.notifyConnectedFamily({
    elderId,
    actorUserId: elderId,
    type: 'CHECKIN_COMPLETED',
    title: 'Daily Check-in Completed',
    message: `${elder?.name || 'Your connected elder'} completed their ${period.toLowerCase()} check-in.`,
    relatedEntityType: 'CHECKIN',
    relatedEntityId: completed.id,
  }).catch(() => {})

  return toPublic(completed, now)
}

async function getHistory(elderId, query = {}, now = new Date()) {
  const today = localDateTime(now).date
  const end = query.to || today
  const start = query.from || addDays(end, -(HISTORY_DAYS - 1))
  const checkIns = await reconcileRange(elderId, start, end, now)
  return checkIns.map((checkIn) => toPublic(checkIn, now))
}

async function getOne(checkInId, elderId, now = new Date()) {
  const checkIn = await prisma.checkIn.findFirst({ where: { id: checkInId, elderId } })
  if (!checkIn) throw new CheckInError(404, 'Check-in not found.')
  const date = dateValue(checkIn.checkinDate)
  const rows = await reconcileRange(elderId, date, date, now)
  const updated = rows.find((row) => row.id === checkInId) || checkIn
  return toPublic(updated, now)
}

async function getFamilyCheckIns(familyId, elderId, now = new Date()) {
  const connection = await prisma.familyConnection.findFirst({
    where: { familyId, elderId, status: 'ACCEPTED' }, select: { id: true },
  })
  if (!connection) throw new CheckInError(404, 'Connected elder check-ins not found.')
  const elder = await findElder(elderId)
  const today = localDateTime(now).date
  const historyStart = addDays(today, -(HISTORY_DAYS - 1))
  const history = await reconcileRange(elderId, historyStart, today, now)
  return {
    elder: { id: elder.id, name: elder.name },
    today: history.filter((checkIn) => dateValue(checkIn.checkinDate) === today).map((checkIn) => toPublic(checkIn, now)),
    history: history.map((checkIn) => toPublic(checkIn, now)),
  }
}

module.exports = {
  CheckInError,
  completeToday,
  getFamilyCheckIns,
  getHistory,
  getOne,
  getToday,
  localDateTime,
  reconcileRange,
  toPublic,
}
