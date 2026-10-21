const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_workflows_test_secret_32_characters_minimum_length_safe'
process.env.APP_TIMEZONE = 'UTC'
process.env.AI_PROVIDER = 'mock'

// Isolated in-memory state for E2E workflows
const db = {
  users: [],
  connections: [],
  medications: [],
  doses: [],
  checkIns: [],
  emergencies: [],
  conversations: [],
  messages: [],
  notifications: [],
}

let idCounter = 1
const genId = (prefix) => `${prefix}-${idCounter++}`

function enrichEvent(event) {
  if (!event) return null
  return {
    ...event,
    elder: db.users.find((u) => u.id === event.elderId) || null,
    acknowledgedBy: db.users.find((u) => u.id === event.acknowledgedById) || null,
    resolvedBy: db.users.find((u) => u.id === event.resolvedById) || null,
  }
}

function enrichConnection(conn) {
  if (!conn) return null
  return {
    ...conn,
    elder: db.users.find((u) => u.id === conn.elderId) || null,
    family: db.users.find((u) => u.id === conn.familyId) || null,
  }
}

const prismaMock = {
  user: {
    async create({ data }) {
      const user = { id: genId('usr'), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.users.push(user)
      return user
    },
    async findUnique({ where, select }) {
      const user = db.users.find((u) => (where.id && u.id === where.id) || (where.email && u.email === where.email)) || null
      if (!user) return null
      return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, user[k]])) : user
    },
    async findFirst({ where, select }) {
      const user = db.users.find((u) => (!where.id || u.id === where.id) && (!where.email || u.email === where.email) && (!where.role || u.role === where.role)) || null
      if (!user) return null
      return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, user[k]])) : user
    },
    async update({ where, data }) {
      const user = db.users.find((u) => u.id === where.id)
      if (!user) throw new Error('User not found')
      Object.assign(user, data, { updatedAt: new Date() })
      return user
    },
  },
  familyConnection: {
    async create({ data }) {
      const conn = { id: genId('conn'), status: data.status || 'PENDING', createdAt: new Date(), updatedAt: new Date(), ...data }
      db.connections.push(conn)
      return enrichConnection(conn)
    },
    async findUnique({ where }) {
      if (where.id) return enrichConnection(db.connections.find((c) => c.id === where.id) || null)
      if (where.familyId_elderId) {
        const { familyId, elderId } = where.familyId_elderId
        return enrichConnection(db.connections.find((c) => c.familyId === familyId && c.elderId === elderId) || null)
      }
      return null
    },
    async findFirst({ where, select }) {
      const conn = db.connections.find((c) =>
        (!where.id || c.id === where.id) &&
        (!where.elderId || c.elderId === where.elderId) &&
        (!where.familyId || c.familyId === where.familyId) &&
        (!where.status || c.status === where.status)
      ) || null
      return enrichConnection(conn)
    },
    async findMany({ where }) {
      return db.connections
        .filter((c) =>
          (!where.elderId || c.elderId === where.elderId) &&
          (!where.familyId || c.familyId === where.familyId) &&
          (!where.status || c.status === where.status)
        )
        .map(enrichConnection)
    },
    async update({ where, data }) {
      const conn = db.connections.find((c) => c.id === where.id)
      if (!conn) throw new Error('Connection not found')
      Object.assign(conn, data, { updatedAt: new Date() })
      return enrichConnection(conn)
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const c of db.connections) {
        if ((!where.id || c.id === where.id) && (!where.elderId || c.elderId === where.elderId) && (!where.status || c.status === where.status)) {
          Object.assign(c, data, { updatedAt: new Date() })
          count++
        }
      }
      return { count }
    },
  },
  medication: {
    async create({ data }) {
      const med = { id: genId('med'), createdAt: new Date(), updatedAt: new Date(), active: true, times: ['09:00'], ...data }
      db.medications.push(med)
      return med
    },
    async findFirst({ where }) {
      return db.medications.find((m) =>
        (!where.id || m.id === where.id) &&
        (!where.elderId || m.elderId === where.elderId)
      ) || null
    },
    async findMany({ where }) {
      return db.medications.filter((m) =>
        (!where.elderId || m.elderId === where.elderId) &&
        (where.active === undefined || m.active === where.active)
      )
    },
  },
  medicationLog: {
    async findFirst() { return null },
    async findMany() { return [] },
    async create({ data }) {
      const log = { id: genId('log'), recordedAt: new Date(), ...data }
      db.doses.push(log)
      return log
    },
  },
  checkIn: {
    async createMany({ data }) {
      for (const row of data) {
        db.checkIns.push({ id: genId('chk'), status: 'PENDING', checkedInAt: null, createdAt: new Date(), updatedAt: new Date(), ...row })
      }
      return { count: data.length }
    },
    async findFirst({ where }) {
      return db.checkIns.find((c) =>
        (!where.elderId || c.elderId === where.elderId) &&
        (!where.period || c.period === where.period) &&
        (!where.status || c.status === where.status)
      ) || null
    },
    async findMany({ where }) {
      return db.checkIns.filter((c) =>
        (!where.elderId || c.elderId === where.elderId) &&
        (!where.period || c.period === where.period) &&
        (!where.status || c.status === where.status)
      )
    },
    async findUnique({ where }) {
      return db.checkIns.find((c) => c.id === where.id) || null
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const c of db.checkIns) {
        const idMatches = !where.id || c.id === where.id
        const elderMatches = !where.elderId || c.elderId === where.elderId
        const periodMatches = !where.period || c.period === where.period
        const statusMatches = !where.status || (where.status.in ? where.status.in.includes(c.status) : c.status === where.status)
        if (idMatches && elderMatches && periodMatches && statusMatches) {
          Object.assign(c, data, { updatedAt: new Date() })
          count++
        }
      }
      return { count }
    },
    async update({ where, data }) {
      const checkin = db.checkIns.find((c) => c.id === where.id)
      if (!checkin) throw new Error('Checkin not found')
      Object.assign(checkin, data, { updatedAt: new Date() })
      return checkin
    },
  },
  emergencyEvent: {
    async create({ data }) {
      const event = {
        id: genId('sos'),
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
        ...data,
      }
      db.emergencies.push(event)
      return enrichEvent(event)
    },
    async findFirst({ where }) {
      const found = db.emergencies.find((e) =>
        (!where.id || e.id === where.id) &&
        (!where.elderId || (where.elderId.in ? where.elderId.in.includes(e.elderId) : e.elderId === where.elderId)) &&
        (!where.status || (where.status.in ? where.status.in.includes(e.status) : e.status === where.status))
      )
      return enrichEvent(found || null)
    },
    async findUnique({ where }) {
      const found = db.emergencies.find((e) => e.id === where.id)
      return enrichEvent(found || null)
    },
    async findMany({ where }) {
      return db.emergencies
        .filter((e) =>
          (!where.id || e.id === where.id) &&
          (!where.elderId || (where.elderId.in ? where.elderId.in.includes(e.elderId) : e.elderId === where.elderId)) &&
          (!where.status || (where.status.in ? where.status.in.includes(e.status) : e.status === where.status))
        )
        .map(enrichEvent)
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const e of db.emergencies) {
        if ((!where.id || e.id === where.id) && (!where.status || e.status === where.status)) {
          Object.assign(e, data, { updatedAt: new Date() })
          count++
        }
      }
      return { count }
    },
  },
  conversation: {
    async create({ data }) {
      const conv = { id: genId('conv'), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.conversations.push(conv)
      return conv
    },
    async findFirst({ where, include }) {
      const item = db.conversations.find((c) => (!where.id || c.id === where.id) && (!where.userId || c.userId === where.userId))
      if (!item) return null
      if (include?.messages) {
        const msgs = db.messages.filter((m) => m.conversationId === item.id)
        return { ...item, messages: msgs }
      }
      return item
    },
    async findMany({ where }) {
      return db.conversations.filter((c) => !where.userId || c.userId === where.userId)
    },
    async update({ where, data }) {
      const item = db.conversations.find((c) => c.id === where.id)
      if (!item) throw new Error('Not found')
      Object.assign(item, data, { updatedAt: new Date() })
      return item
    },
  },
  chatMessage: {
    async create({ data }) {
      const msg = { id: genId('msg'), createdAt: new Date(), ...data }
      db.messages.push(msg)
      return msg
    },
    async findMany({ where, take = 10 }) {
      const msgs = db.messages.filter((m) => !where.conversationId || m.conversationId === where.conversationId)
      return msgs.slice(-take)
    },
  },
  notification: {
    async create({ data }) {
      const notif = { id: genId('notif'), readAt: null, createdAt: new Date(), ...data }
      db.notifications.push(notif)
      return notif
    },
    async findFirst({ where }) {
      return db.notifications.find((n) =>
        (!where.id || n.id === where.id) &&
        (!where.recipientUserId || n.recipientUserId === where.recipientUserId)
      ) || null
    },
    async findMany({ where }) {
      return db.notifications.filter((n) =>
        (!where.recipientUserId || n.recipientUserId === where.recipientUserId) &&
        (!where.readAt || (where.readAt === null ? n.readAt === null : true))
      )
    },
    async count({ where }) {
      return db.notifications.filter((n) =>
        (!where.recipientUserId || n.recipientUserId === where.recipientUserId) &&
        (!where.readAt || (where.readAt === null ? n.readAt === null : true))
      ).length
    },
    async update({ where, data }) {
      const notif = db.notifications.find((n) => n.id === where.id)
      if (!notif) throw new Error('Notification not found')
      Object.assign(notif, data)
      return notif
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const n of db.notifications) {
        if (!where.recipientUserId || n.recipientUserId === where.recipientUserId) {
          Object.assign(n, data)
          count++
        }
      }
      return { count }
    },
    async delete({ where }) {
      const idx = db.notifications.findIndex((n) => n.id === where.id)
      if (idx !== -1) db.notifications.splice(idx, 1)
      return { id: where.id }
    },
  },
  $transaction: async (fn) => fn(prismaMock),
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')

let server
let baseUrl

function tokenFor(user) {
  return jwt.sign({ role: user.role }, process.env.JWT_SECRET, { subject: user.id, expiresIn: '1h' })
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, headers: res.headers, data }
}

before(async () => {
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
})

test('Workflow 1: Elder onboarding and profile management', async () => {
  // 1. Register elder
  const regRes = await request('/api/auth/register', {
    method: 'POST',
    body: {
      name: 'Margaret Hale',
      email: 'margaret@eldercare.test',
      password: 'StrongPassword123!',
      role: 'ELDER',
      phone: '9876543210',
    },
  })
  assert.equal(regRes.status, 201)
  assert.equal(regRes.data.user.role, 'ELDER')
  assert.equal(regRes.data.user.passwordHash, undefined, 'Never leak passwordHash')

  // 2. Login
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'margaret@eldercare.test', password: 'StrongPassword123!' },
  })
  assert.equal(loginRes.status, 200)
  assert.ok(loginRes.data.token)

  // 3. View profile
  const meRes = await request('/api/users/me', { token: loginRes.data.token })
  assert.equal(meRes.status, 200)
  assert.equal(meRes.data.user.name, 'Margaret Hale')

  // 4. Update profile
  const updateRes = await request('/api/users/me', {
    method: 'PUT',
    token: loginRes.data.token,
    body: { name: 'Margaret Thornton', phone: '9123456780' },
  })
  assert.equal(updateRes.status, 200)
  assert.equal(updateRes.data.user.name, 'Margaret Thornton')
})

test('Workflow 2: Family connection and cross-account privacy', async () => {
  // Register family 1 and family 2
  const elder = db.users.find((u) => u.email === 'margaret@eldercare.test')
  const f1 = await prismaMock.user.create({
    data: { name: 'John Thornton', email: 'john@family.test', role: 'FAMILY', passwordHash: 'hash' },
  })
  const f2 = await prismaMock.user.create({
    data: { name: 'Stranger Family', email: 'stranger@family.test', role: 'FAMILY', passwordHash: 'hash' },
  })

  const f1Token = tokenFor(f1)
  const f2Token = tokenFor(f2)
  const elderToken = tokenFor(elder)

  // Family 1 creates connection request to elder
  const connReq = await request('/api/connections', {
    method: 'POST',
    token: f1Token,
    body: { elderId: elder.id, relationship: 'Son' },
  })
  assert.equal(connReq.status, 201)
  const connId = connReq.data.connection?.id || db.connections[0].id

  // Elder accepts the request
  const acceptRes = await request(`/api/connections/${connId}/accept`, {
    method: 'PUT',
    token: elderToken,
  })
  assert.equal(acceptRes.status, 200)

  // Family 1 can read elder medications/dashboard
  const familyViewRes = await request(`/api/family/elders/${elder.id}/medications`, { token: f1Token })
  assert.equal(familyViewRes.status, 200)

  // Stranger Family 2 cannot access elder details (enforces 404 Not Found for non-connected elder)
  const strangerRes = await request(`/api/family/elders/${elder.id}/medications`, { token: f2Token })
  assert.equal(strangerRes.status, 404)
})

test('Workflow 3 & 4: Medication adherence and Daily Check-in', async () => {
  const elder = db.users.find((u) => u.role === 'ELDER')
  const family = db.users.find((u) => u.email === 'john@family.test')
  const elderToken = tokenFor(elder)
  const familyToken = tokenFor(family)

  // Elder adds medication
  const medRes = await request('/api/medications', {
    method: 'POST',
    token: elderToken,
    body: {
      name: 'Metformin',
      dosage: '500mg',
      instructions: 'With water',
      times: ['09:00'],
      frequency: 'ONCE_DAILY',
      startDate: '2026-10-21',
    },
  })
  assert.equal(medRes.status, 201)

  // Family cannot create or modify medications (role protection)
  const familyPostMed = await request('/api/medications', {
    method: 'POST',
    token: familyToken,
    body: {
      name: 'Disallowed',
      dosage: '10mg',
      instructions: '',
      times: ['08:00'],
      frequency: 'ONCE_DAILY',
      startDate: '2026-10-21',
    },
  })
  assert.equal(familyPostMed.status, 403)

  // Elder completes check-in
  const checkinRes = await request('/api/checkins/today', {
    method: 'POST',
    token: elderToken,
    body: { period: 'MORNING' },
  })
  assert.equal(checkinRes.status, 200)

  // Family can view check-in status
  const familyCheckinView = await request(`/api/family/elders/${elder.id}/checkins`, { token: familyToken })
  assert.equal(familyCheckinView.status, 200)
})

test('Workflow 5, 6 & 7: SOS, Notifications, and AI Assistant isolation', async () => {
  const elder = db.users.find((u) => u.role === 'ELDER')
  const family = db.users.find((u) => u.email === 'john@family.test')
  const stranger = db.users.find((u) => u.email === 'stranger@family.test')
  const elderToken = tokenFor(elder)
  const familyToken = tokenFor(family)
  const strangerToken = tokenFor(stranger)

  // 1. SOS activation
  const sosRes = await request('/api/sos', {
    method: 'POST',
    token: elderToken,
    body: { notes: 'Need urgent assistance' },
  })
  assert.equal(sosRes.status, 201)
  const sosId = sosRes.data.event.id

  // 2. Stranger cannot acknowledge SOS (enforces 404 to prevent ID enumeration)
  const strangerAck = await request(`/api/sos/${sosId}/acknowledge`, { method: 'POST', token: strangerToken })
  assert.equal(strangerAck.status, 404)

  // 3. Authorized family member acknowledges SOS
  const famAck = await request(`/api/sos/${sosId}/acknowledge`, { method: 'POST', token: familyToken })
  assert.equal(famAck.status, 200)

  // 4. Notifications generated for family
  const notifRes = await request('/api/notifications', { token: familyToken })
  assert.equal(notifRes.status, 200)

  // 5. AI assistant chat session
  const aiRes = await request('/api/assistant/chat', {
    method: 'POST',
    token: elderToken,
    body: { message: 'How do I take care of hydration in warm weather?' },
  })
  assert.equal(aiRes.status, 200)
  assert.ok(aiRes.data.message?.content)
  assert.ok(aiRes.data.conversationId)

  // 6. Another user cannot access elder's private AI conversation
  const strangerAiRes = await request('/api/assistant/chat', {
    method: 'POST',
    token: strangerToken,
    body: { conversationId: aiRes.data.conversationId, message: 'Intrusion message' },
  })
  assert.equal(strangerAiRes.status, 404, 'Must not allow access to another user conversation')
})
