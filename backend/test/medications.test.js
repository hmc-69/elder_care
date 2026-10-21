const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = 'medication_test_secret_only_never_used_outside_this_test'
process.env.APP_TIMEZONE = 'UTC'
process.env.CHECKIN_MORNING_TIME = '07:00'
process.env.CHECKIN_NIGHT_TIME = '23:59'
process.env.CHECKIN_GRACE_MINUTES = '60'

const users = [
  { id: 'elder-a', role: 'ELDER', name: 'Elder A' },
  { id: 'elder-b', role: 'ELDER', name: 'Elder B' },
  { id: 'family-a', role: 'FAMILY', name: 'Family A' },
  { id: 'family-b', role: 'FAMILY', name: 'Family B' },
]
const connections = [{ id: 'connection-a', familyId: 'family-a', elderId: 'elder-a', status: 'ACCEPTED' }]
const medications = []
const logs = []
const checkIns = []
let nextId = 1

function day(value) { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10) }
function matchesMedication(item, where = {}) {
  if (where.id && item.id !== where.id) return false
  if (where.elderId && item.elderId !== where.elderId) return false
  if (where.active !== undefined && item.active !== where.active) return false
  if (where.startDate?.lte && day(item.startDate) > day(where.startDate.lte)) return false
  if (where.OR && !where.OR.some((condition) => condition.endDate === null
    ? item.endDate === null
    : condition.endDate?.gte && day(item.endDate) >= day(condition.endDate.gte))) return false
  return true
}
function matchesLog(item, where = {}) {
  if (where.id && item.id !== where.id) return false
  if (where.status && item.status !== where.status) return false
  if (where.medicationId && typeof where.medicationId === 'string' && item.medicationId !== where.medicationId) return false
  if (where.medicationId?.in && !where.medicationId.in.includes(item.medicationId)) return false
  if (where.scheduledDate && day(item.scheduledDate) !== day(where.scheduledDate)) return false
  return true
}
function matchesCheckIn(item, where = {}) {
  if (where.id && item.id !== where.id) return false
  if (where.elderId && item.elderId !== where.elderId) return false
  if (where.period && item.period !== where.period) return false
  if (where.status && typeof where.status === 'string' && item.status !== where.status) return false
  if (where.status?.in && !where.status.in.includes(item.status)) return false
  if (where.checkinDate instanceof Date && day(item.checkinDate) !== day(where.checkinDate)) return false
  if (where.checkinDate?.lt && !(day(item.checkinDate) < day(where.checkinDate.lt))) return false
  if (where.checkinDate?.gte && !(day(item.checkinDate) >= day(where.checkinDate.gte))) return false
  if (where.checkinDate?.lte && !(day(item.checkinDate) <= day(where.checkinDate.lte))) return false
  return true
}

const prismaMock = {
  user: {
    async findUnique({ where }) { return users.find((item) => item.id === where.id || (where.email && item.email === where.email)) ?? null },
    async findFirst({ where, select }) {
      const user = users.find((item) => item.id === where.id && (!where.role || item.role === where.role))
      return user && select ? Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key]])) : user ?? null
    },
  },
  familyConnection: {
    async findFirst({ where }) { return connections.find((item) => item.familyId === where.familyId && item.elderId === where.elderId && item.status === where.status) ?? null },
  },
  medication: {
    async create({ data }) {
      const item = { id: `medication-${nextId++}`, ...data, active: true, createdAt: new Date(), updatedAt: new Date() }
      medications.push(item)
      return item
    },
    async findUnique({ where }) { return medications.find((item) => item.id === where.id) ?? null },
    async findMany({ where = {} }) { return medications.filter((item) => matchesMedication(item, where)) },
    async update({ where, data }) {
      const item = medications.find((candidate) => candidate.id === where.id)
      Object.assign(item, data, { updatedAt: new Date() })
      return item
    },
    async updateMany({ where, data }) {
      const item = medications.find((candidate) => matchesMedication(candidate, where))
      if (!item) return { count: 0 }
      Object.assign(item, data, { updatedAt: new Date() })
      return { count: 1 }
    },
  },
  medicationLog: {
    async createMany({ data }) {
      for (const item of data) {
        if (!logs.some((existing) => existing.medicationId === item.medicationId && day(existing.scheduledDate) === day(item.scheduledDate) && existing.scheduledTime === item.scheduledTime)) {
          logs.push({ id: `log-${nextId++}`, ...item, status: 'PENDING', takenAt: null, createdAt: new Date(), updatedAt: new Date() })
        }
      }
      return { count: data.length }
    },
    async findMany({ where = {}, orderBy }) {
      const result = logs.filter((item) => matchesLog(item, where))
      if (orderBy?.some((order) => order.scheduledDate === 'desc')) result.sort((a, b) => day(b.scheduledDate).localeCompare(day(a.scheduledDate)) || b.scheduledTime.localeCompare(a.scheduledTime))
      else result.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
      return result
    },
    async updateMany({ where, data }) {
      const item = logs.find((candidate) => matchesLog(candidate, where))
      if (!item) return { count: 0 }
      Object.assign(item, data, { updatedAt: new Date() })
      return { count: 1 }
    },
  },
  checkIn: {
    async createMany({ data }) {
      for (const row of data) if (!checkIns.some((item) => item.elderId === row.elderId && day(item.checkinDate) === day(row.checkinDate) && item.period === row.period)) {
        checkIns.push({ id: `checkin-${nextId++}`, ...row, status: 'PENDING', checkedInAt: null, createdAt: new Date(), updatedAt: new Date() })
      }
      return { count: data.length }
    },
    async findMany({ where, orderBy }) {
      const items = checkIns.filter((item) => matchesCheckIn(item, where))
      if (orderBy?.checkinDate === 'desc') items.sort((a, b) => day(b.checkinDate).localeCompare(day(a.checkinDate)))
      return items
    },
    async findFirst({ where }) { return checkIns.find((item) => matchesCheckIn(item, where)) ?? null },
    async findUnique({ where }) { return checkIns.find((item) => item.id === where.id) ?? null },
    async updateMany({ where, data }) {
      const items = checkIns.filter((item) => matchesCheckIn(item, where))
      for (const item of items) Object.assign(item, data, { updatedAt: new Date() })
      return { count: items.length }
    },
  },
  async $disconnect() {},
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')
const { statusForLog } = require('../src/services/medicationService')
let server
let baseUrl

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

function token(id, role) { return jwt.sign({ sub: id, role }, process.env.JWT_SECRET) }
async function api(path, { method = 'GET', body, user, role } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(user ? { Authorization: `Bearer ${token(user, role)}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, data: await response.json() }
}

const today = new Date().toISOString().slice(0, 10)
const minutesNow = new Date().getUTCHours() * 60 + new Date().getUTCMinutes()
const dueTime = `${String(Math.floor(Math.max(0, minutesNow - 2) / 60)).padStart(2, '0')}:${String(Math.max(0, minutesNow - 2) % 60).padStart(2, '0')}`
let medicationId

test('dose status moves from waiting to due to missed after the grace period', () => {
  const log = { status: 'PENDING', scheduledDate: new Date('2026-10-02T00:00:00.000Z'), scheduledTime: '08:00' }
  assert.equal(statusForLog(log, new Date('2026-10-02T07:59:00.000Z')), 'PENDING')
  assert.equal(statusForLog(log, new Date('2026-10-02T08:00:00.000Z')), 'DUE')
  assert.equal(statusForLog(log, new Date('2026-10-02T08:59:00.000Z')), 'DUE')
  assert.equal(statusForLog(log, new Date('2026-10-02T09:00:00.000Z')), 'MISSED')
})

test('medication access is authenticated and role protected', async () => {
  assert.equal((await api('/api/medications')).response.status, 401)
  const familyCreate = await api('/api/medications', { user: 'family-a', role: 'FAMILY', method: 'POST', body: {} })
  assert.equal(familyCreate.response.status, 403, JSON.stringify(familyCreate.data))
  assert.equal((await api('/api/medications/today', { user: 'family-a', role: 'FAMILY' })).response.status, 403)
})

test('elder creates medication, reads today, takes a due dose, and retains log history', async () => {
  const invalid = await api('/api/medications', { user: 'elder-a', role: 'ELDER', method: 'POST', body: {
    name: 'Medicine', dosage: '1 tablet', frequency: 'TWICE_DAILY', times: ['08:00'], startDate: today,
  } })
  assert.equal(invalid.response.status, 400)

  const created = await api('/api/medications', { user: 'elder-a', role: 'ELDER', method: 'POST', body: {
    name: 'Vitamin D', dosage: '1 tablet', instructions: 'After food', frequency: 'ONCE_DAILY', times: [dueTime], startDate: today,
  } })
  assert.equal(created.response.status, 201)
  assert.equal(created.data.medication.name, 'Vitamin D')
  medicationId = created.data.medication.id

  const ownerList = await api('/api/medications', { user: 'elder-a', role: 'ELDER' })
  assert.equal(ownerList.data.medications.length, 1)
  const otherElderList = await api('/api/medications', { user: 'elder-b', role: 'ELDER' })
  assert.equal(otherElderList.data.medications.length, 0, JSON.stringify(otherElderList.data))

  const familyView = await api('/api/family/elders/elder-a/medications', { user: 'family-a', role: 'FAMILY' })
  assert.equal(familyView.response.status, 200)
  assert.equal(familyView.data.elder.name, 'Elder A')
  assert.equal(familyView.data.today[0].status, 'DUE')
  assert.equal((await api('/api/medications', { user: 'family-a', role: 'FAMILY' })).response.status, 400)
  assert.equal((await api('/api/medications', { user: 'family-a', role: 'FAMILY' })).data.message, 'Provide an elderId to view connected medications.')
  assert.equal((await api('/api/medications?elderId=elder-a', { user: 'family-a', role: 'FAMILY' })).data.medications.length, 1)
  assert.equal((await api('/api/family/elders/elder-a/medications', { user: 'family-b', role: 'FAMILY' })).response.status, 404)

  assert.equal((await api(`/api/medications/${medicationId}`, { user: 'elder-b', role: 'ELDER' })).response.status, 404)
  assert.equal((await api(`/api/medications/${medicationId}`, { user: 'family-a', role: 'FAMILY' })).response.status, 200)
  assert.equal((await api(`/api/medications/${medicationId}`, { user: 'family-b', role: 'FAMILY' })).response.status, 404)
  assert.equal((await api(`/api/medications/${medicationId}`, { user: 'elder-a', role: 'ELDER', method: 'PUT', body: { name: 'Nope' } })).response.status, 200)

  assert.equal((await api(`/api/medications/${medicationId}`, { user: 'family-a', role: 'FAMILY', method: 'PUT', body: { name: 'Nope' } })).response.status, 403)
  assert.equal((await api(`/api/medications/${medicationId}/taken`, { user: 'family-a', role: 'FAMILY', method: 'POST' })).response.status, 403)
  const taken = await api(`/api/medications/${medicationId}/taken`, { user: 'elder-a', role: 'ELDER', method: 'POST' })
  assert.equal(taken.response.status, 200)
  assert.equal(taken.data.event.status, 'TAKEN')
  assert.equal((await api(`/api/medications/${medicationId}/taken`, { user: 'elder-a', role: 'ELDER', method: 'POST' })).response.status, 409)
  const history = await api(`/api/medications/${medicationId}/logs`, { user: 'family-a', role: 'FAMILY' })
  assert.equal(history.data.logs[0].status, 'TAKEN')

  const updated = await api(`/api/medications/${medicationId}`, { user: 'elder-a', role: 'ELDER', method: 'PUT', body: { dosage: '2 tablets' } })
  assert.equal(updated.data.medication.dosage, '2 tablets')
  const deactivated = await api(`/api/medications/${medicationId}`, { user: 'elder-a', role: 'ELDER', method: 'DELETE' })
  assert.equal(deactivated.data.medication.active, false)
  assert.equal((await api(`/api/medications/${medicationId}/logs`, { user: 'elder-a', role: 'ELDER' })).data.logs.length, 1)
  assert.equal((await api('/api/medications/today', { user: 'elder-a', role: 'ELDER' })).data.medications.length, 0)
})

test('invalid IDs and invalid date ranges are safely rejected', async () => {
  assert.equal((await api('/api/medications/not-a-real-id', { user: 'elder-a', role: 'ELDER' })).response.status, 404)
  const invalid = await api('/api/medications', { user: 'elder-a', role: 'ELDER', method: 'POST', body: {
    name: 'Medicine', dosage: '1 tablet', frequency: 'ONCE_DAILY', times: ['08:00'], startDate: '2026-10-03', endDate: '2026-10-02',
  } })
  assert.equal(invalid.response.status, 400)
  const duplicateTimes = await api('/api/medications', { user: 'elder-a', role: 'ELDER', method: 'POST', body: {
    name: 'Medicine', dosage: '1 tablet', frequency: 'CUSTOM', times: ['08:00', '08:00'], startDate: today,
  } })
  assert.equal(duplicateTimes.response.status, 400)
})

test('daily check-ins reconcile once, complete once, enforce ownership, and provide accepted family read-only access', async () => {
  assert.equal((await api('/api/checkins/today')).response.status, 401)
  assert.equal((await api('/api/checkins/today', { user: 'family-a', role: 'FAMILY' })).response.status, 403)

  const first = await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER' })
  assert.equal(first.response.status, 200, JSON.stringify(first.data))
  assert.equal(first.data.checkIns.length, 2)
  const morning = first.data.checkIns.find((item) => item.period === 'MORNING')
  assert.ok(['PENDING', 'MISSED'].includes(morning.status))
  assert.equal(morning.date, today)
  assert.equal(checkIns.filter((item) => item.elderId === 'elder-a' && day(item.checkinDate) === today).length, 2)
  assert.equal((await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER' })).response.status, 200)
  assert.equal(checkIns.filter((item) => item.elderId === 'elder-a' && day(item.checkinDate) === today).length, 2)

  const complete = await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER', method: 'POST', body: { period: 'MORNING' } })
  assert.equal(complete.response.status, 200, JSON.stringify(complete.data))
  assert.equal(complete.data.checkIn.status, 'COMPLETED')
  assert.ok(complete.data.checkIn.checkedInAt)
  const duplicate = await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER', method: 'POST', body: { period: 'MORNING' } })
  assert.equal(duplicate.response.status, 409)
  assert.equal(duplicate.data.checkIn.status, 'COMPLETED')
  const nightComplete = await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER', method: 'POST', body: { period: 'NIGHT' } })
  assert.equal(nightComplete.response.status, 200)
  assert.equal(nightComplete.data.checkIn.period, 'NIGHT')
  assert.equal((await api('/api/checkins/today', { user: 'elder-a', role: 'ELDER', method: 'POST', body: { period: 'NIGHT' } })).response.status, 409)

  const history = await api(`/api/checkins/history?from=${today}&to=${today}`, { user: 'elder-a', role: 'ELDER' })
  assert.equal(history.response.status, 200)
  assert.equal(history.data.history.length, 2)
  assert.equal(history.data.history.find((item) => item.period === 'MORNING').status, 'COMPLETED')
  assert.equal(history.data.history.find((item) => item.period === 'NIGHT').status, 'COMPLETED')
  assert.equal((await api('/api/checkins/history?from=2026-02-30', { user: 'elder-a', role: 'ELDER' })).response.status, 400)
  assert.equal((await api('/api/checkins/history?unexpected=x', { user: 'elder-a', role: 'ELDER' })).response.status, 400)
  assert.equal((await api(`/api/checkins/history?from=${today}&to=2020-01-01`, { user: 'elder-a', role: 'ELDER' })).response.status, 400)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  assert.equal((await api(`/api/checkins/history?from=${tomorrow}`, { user: 'elder-a', role: 'ELDER' })).response.status, 400)
  assert.equal((await api('/api/checkins/history?from=2020-01-01&to=2020-04-01', { user: 'elder-a', role: 'ELDER' })).response.status, 400)
  assert.equal((await api(`/api/checkins/${complete.data.checkIn.id}`, { user: 'elder-b', role: 'ELDER' })).response.status, 404)
  assert.equal((await api(`/api/checkins/${complete.data.checkIn.id}`, { user: 'elder-a', role: 'ELDER' })).data.checkIn.status, 'COMPLETED')

  const familyView = await api('/api/family/elders/elder-a/checkins', { user: 'family-a', role: 'FAMILY' })
  assert.equal(familyView.response.status, 200, JSON.stringify(familyView.data))
  assert.equal(familyView.data.today.find((item) => item.period === 'MORNING').status, 'COMPLETED')
  assert.equal(familyView.data.today.find((item) => item.period === 'NIGHT').status, 'COMPLETED')
  assert.ok(familyView.data.history.every((item) => item.status === 'COMPLETED'))
  assert.equal((await api('/api/family/elders/elder-a/checkins', { user: 'family-b', role: 'FAMILY' })).response.status, 404)
  assert.equal((await api('/api/family/elders/elder-a/checkins', { user: 'family-a', role: 'FAMILY', method: 'POST', body: {} })).response.status, 404)

  process.env.CHECKIN_MORNING_TIME = '00:00'
  process.env.CHECKIN_GRACE_MINUTES = '0'
  const missed = await api('/api/checkins/today', { user: 'elder-b', role: 'ELDER' })
  assert.equal(missed.response.status, 200)
  assert.equal(missed.data.checkIns.find((item) => item.period === 'MORNING').status, 'MISSED')
  const late = await api('/api/checkins/today', { user: 'elder-b', role: 'ELDER', method: 'POST', body: { period: 'MORNING' } })
  assert.equal(late.response.status, 200)
  assert.equal(late.data.checkIn.status, 'COMPLETED')
  assert.equal(late.data.checkIn.late, true)
})
