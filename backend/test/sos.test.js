const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'medication_test_secret_only_never_used_outside_this_test'
process.env.APP_TIMEZONE = 'UTC'

const users = [
  { id: 'elder-a', role: 'ELDER', name: 'Elder A' },
  { id: 'elder-b', role: 'ELDER', name: 'Elder B' },
  { id: 'family-a', role: 'FAMILY', name: 'Family A' },
  { id: 'family-b', role: 'FAMILY', name: 'Family B' },
]

const connections = [
  { id: 'conn-a', familyId: 'family-a', elderId: 'elder-a', status: 'ACCEPTED' },
  { id: 'conn-b', familyId: 'family-b', elderId: 'elder-b', status: 'PENDING' },
]

const emergencyEvents = []
let nextId = 1

function matchesEmergency(item, where = {}) {
  if (where.id && item.id !== where.id) return false
  if (where.elderId && typeof where.elderId === 'string' && item.elderId !== where.elderId) return false
  if (where.elderId?.in && !where.elderId.in.includes(item.elderId)) return false
  if (where.status && typeof where.status === 'string' && item.status !== where.status) return false
  if (where.status?.in && !where.status.in.includes(item.status)) return false
  return true
}

function enrichEvent(event) {
  if (!event) return null
  return {
    ...event,
    elder: users.find((u) => u.id === event.elderId) || null,
    acknowledgedBy: users.find((u) => u.id === event.acknowledgedById) || null,
    resolvedBy: users.find((u) => u.id === event.resolvedById) || null,
  }
}

const prismaMock = {
  user: {
    async findUnique({ where }) {
      return users.find((item) => item.id === where.id) ?? null
    },
    async findFirst({ where, select }) {
      const user = users.find((item) => item.id === where.id && (!where.role || item.role === where.role))
      if (!user) return null
      return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, user[k]])) : user
    },
  },
  familyConnection: {
    async findFirst({ where, select }) {
      const item = connections.find((c) => c.familyId === where.familyId && c.elderId === where.elderId && (!where.status || c.status === where.status))
      if (!item) return null
      return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, item[k]])) : item
    },
    async findMany({ where }) {
      return connections.filter((c) => c.familyId === where.familyId && (!where.status || c.status === where.status))
    },
  },
  emergencyEvent: {
    async create({ data }) {
      const row = {
        id: `sos-${nextId++}`,
        elderId: data.elderId,
        status: data.status || 'ACTIVE',
        triggeredAt: data.triggeredAt || new Date(),
        acknowledgedAt: null,
        acknowledgedById: null,
        resolvedAt: null,
        resolvedById: null,
        cancelledAt: null,
        cancellationReason: null,
        notes: data.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      emergencyEvents.push(row)
      return enrichEvent(row)
    },
    async findFirst({ where, orderBy }) {
      let filtered = emergencyEvents.filter((item) => matchesEmergency(item, where))
      if (orderBy?.triggeredAt === 'desc') {
        filtered.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
      }
      return enrichEvent(filtered[0] ?? null)
    },
    async findUnique({ where }) {
      const item = emergencyEvents.find((e) => e.id === where.id)
      return enrichEvent(item ?? null)
    },
    async findMany({ where, skip = 0, take = 50, orderBy }) {
      let filtered = emergencyEvents.filter((item) => matchesEmergency(item, where))
      if (orderBy?.triggeredAt === 'desc') {
        filtered.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
      }
      return filtered.slice(skip, skip + take).map(enrichEvent)
    },
    async count({ where }) {
      return emergencyEvents.filter((item) => matchesEmergency(item, where)).length
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const item of emergencyEvents) {
        if (matchesEmergency(item, where)) {
          Object.assign(item, data, { updatedAt: new Date() })
          count++
        }
      }
      return { count }
    },
  },
  notification: {
    async create() { return null },
    async findFirst() { return null },
    async count() { return 0 },
  },
  $transaction: async (fn) => fn(prismaMock),
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')

let server
let baseUrl

function tokenFor(user, role) {
  return jwt.sign({ sub: user, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
}

async function api(path, { user, role, method = 'GET', body } = {}) {
  const headers = {}
  if (user && role) headers.Authorization = `Bearer ${tokenFor(user, role)}`
  if (body) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, data: await response.json().catch(() => ({})) }
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
})

test('Module 6 SOS emergency backend workflows', async () => {
  // 1. Unauthenticated and unauthorized access
  const unauth = await api('/api/sos', { method: 'POST' })
  assert.equal(unauth.response.status, 401)

  const familyCannotTrigger = await api('/api/sos', { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(familyCannotTrigger.response.status, 403)

  // 2. Elder triggers SOS successfully
  const triggerRes = await api('/api/sos', {
    user: 'elder-a',
    role: 'ELDER',
    method: 'POST',
    body: { notes: 'Need assistance in living room' },
  })
  assert.equal(triggerRes.response.status, 201)
  assert.equal(triggerRes.data.event.status, 'ACTIVE')
  assert.equal(triggerRes.data.event.notes, 'Need assistance in living room')
  assert.ok(triggerRes.data.event.triggeredAt)
  assert.ok(triggerRes.data.disclaimer.includes('In-app notification only'))
  const eventId = triggerRes.data.event.id

  // 3. Duplicate active alert is rejected with 409 Conflict
  const dupRes = await api('/api/sos', { user: 'elder-a', role: 'ELDER', method: 'POST' })
  assert.equal(dupRes.response.status, 409)
  assert.equal(dupRes.data.event.id, eventId)
  assert.equal(dupRes.data.event.status, 'ACTIVE')

  // 4. Elder views active SOS
  const activeRes = await api('/api/sos/active', { user: 'elder-a', role: 'ELDER' })
  assert.equal(activeRes.response.status, 200)
  assert.equal(activeRes.data.event.id, eventId)
  assert.equal(activeRes.data.event.status, 'ACTIVE')

  // 5. Unconnected family cannot view or acknowledge the event
  const unconnectedView = await api(`/api/family/elders/elder-a/sos`, { user: 'family-b', role: 'FAMILY' })
  assert.equal(unconnectedView.response.status, 404)

  const unconnectedSingle = await api(`/api/sos/${eventId}`, { user: 'family-b', role: 'FAMILY' })
  assert.equal(unsingleStatus(unconnectedSingle.response.status), 404)

  const unconnectedAck = await api(`/api/sos/${eventId}/acknowledge`, { user: 'family-b', role: 'FAMILY', method: 'POST' })
  assert.equal(unconnectedAck.response.status, 404)

  // 6. Connected family can view active emergency and history
  const familyView = await api(`/api/family/elders/elder-a/sos`, { user: 'family-a', role: 'FAMILY' })
  assert.equal(familyView.response.status, 200)
  assert.equal(familyView.data.elder.id, 'elder-a')
  assert.equal(familyView.data.activeEvent.id, eventId)
  assert.equal(familyView.data.activeEvent.status, 'ACTIVE')
  assert.equal(familyView.data.history.length, 1)

  // Family active emergencies across all connected elders
  const familyAllActive = await api('/api/sos/family/active', { user: 'family-a', role: 'FAMILY' })
  assert.equal(familyAllActive.response.status, 200)
  assert.equal(familyAllActive.data.events.length, 1)
  assert.equal(familyAllActive.data.events[0].id, eventId)

  // 7. Elder cancels active alert
  const cancelRes = await api(`/api/sos/${eventId}/cancel`, {
    user: 'elder-a',
    role: 'ELDER',
    method: 'POST',
    body: { reason: 'Accidentally pressed while cleaning phone' },
  })
  assert.equal(cancelRes.response.status, 200)
  assert.equal(cancelRes.data.event.status, 'CANCELLED')
  assert.equal(cancelRes.data.event.cancellationReason, 'Accidentally pressed while cleaning phone')
  assert.ok(cancelRes.data.event.cancelledAt)

  // 8. Cannot acknowledge or resolve a cancelled alert
  const ackCancelled = await api(`/api/sos/${eventId}/acknowledge`, { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(ackCancelled.response.status, 409)

  const resolveCancelled = await api(`/api/sos/${eventId}/resolve`, { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(resolveCancelled.response.status, 409)

  // 9. Active SOS is now null for elder
  const activeAfterCancel = await api('/api/sos/active', { user: 'elder-a', role: 'ELDER' })
  assert.equal(activeAfterCancel.data.event, null)

  // 10. Trigger a second SOS to test Acknowledge -> Resolve workflow
  const trigger2 = await api('/api/sos', { user: 'elder-a', role: 'ELDER', method: 'POST' })
  assert.equal(trigger2.response.status, 201)
  const eventId2 = trigger2.data.event.id

  // 11. Connected family acknowledges alert
  const ackRes = await api(`/api/sos/${eventId2}/acknowledge`, { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(ackRes.response.status, 200)
  assert.equal(ackRes.data.event.status, 'ACKNOWLEDGED')
  assert.equal(ackRes.data.event.acknowledgedBy.id, 'family-a')
  assert.ok(ackRes.data.event.acknowledgedAt)

  // Simultaneous/repeated acknowledgement is idempotent
  const repeatAck = await api(`/api/sos/${eventId2}/acknowledge`, { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(repeatAck.response.status, 200)
  assert.equal(repeatAck.data.event.status, 'ACKNOWLEDGED')

  // Elder cannot cancel an already acknowledged alert
  const cancelAck = await api(`/api/sos/${eventId2}/cancel`, { user: 'elder-a', role: 'ELDER', method: 'POST' })
  assert.equal(cancelAck.response.status, 409)

  // 12. Connected family resolves alert
  const resolveRes = await api(`/api/sos/${eventId2}/resolve`, {
    user: 'family-a',
    role: 'FAMILY',
    method: 'POST',
    body: { notes: 'Called elder, arrived at home, elder is safe.' },
  })
  assert.equal(resolveRes.response.status, 200)
  assert.equal(resolveRes.data.event.status, 'RESOLVED')
  assert.equal(resolveRes.data.event.resolvedBy.id, 'family-a')
  assert.equal(resolveRes.data.event.notes, 'Called elder, arrived at home, elder is safe.')
  assert.ok(resolveRes.data.event.resolvedAt)

  // Cannot resolve again
  const resolveAgain = await api(`/api/sos/${eventId2}/resolve`, { user: 'family-a', role: 'FAMILY', method: 'POST' })
  assert.equal(resolveAgain.response.status, 409)

  // 13. Elder history shows pagination
  const historyRes = await api('/api/sos/history?page=1&limit=10', { user: 'elder-a', role: 'ELDER' })
  assert.equal(historyRes.response.status, 200)
  assert.equal(historyRes.data.events.length, 2)
  assert.equal(historyRes.data.pagination.total, 2)
  assert.equal(historyRes.data.pagination.page, 1)

  // Other elder has 0 events in history
  const elderBHistory = await api('/api/sos/history', { user: 'elder-b', role: 'ELDER' })
  assert.equal(elderBHistory.data.events.length, 0)
})

function unsingleStatus(status) { return status }
