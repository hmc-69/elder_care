const assert = require('node:assert/strict')
const { after, before, beforeEach, test } = require('node:test')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'notification_test_secret_only_never_used_outside_test_12345'
process.env.APP_TIMEZONE = 'UTC'
process.env.AI_PROVIDER = 'mock'

const users = [
  { id: 'user-1', role: 'ELDER', name: 'Elder Alice' },
  { id: 'user-2', role: 'FAMILY', name: 'Family Bob' },
  { id: 'user-3', role: 'FAMILY', name: 'Family Carol' },
]

let notifications = []
let nextId = 1

function makeNotification(overrides = {}) {
  const n = {
    id: `notif-${nextId++}`,
    recipientUserId: 'user-1',
    actorUserId: null,
    type: 'SYSTEM',
    title: 'Test notification',
    message: 'This is a test.',
    relatedEntityType: null,
    relatedEntityId: null,
    readAt: null,
    createdAt: new Date(),
    actorUser: null,
    ...overrides,
  }
  notifications.push(n)
  return n
}

const prismaMock = {
  user: {
    async findUnique({ where }) {
      return users.find((u) => u.id === where.id) || null
    },
  },
  notification: {
    async count({ where }) {
      return notifications.filter((n) => {
        if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) return false
        if (where.readAt === null && n.readAt !== null) return false
        return true
      }).length
    },
    async findMany({ where, skip = 0, take = 20, orderBy, include }) {
      let filtered = notifications.filter((n) => {
        if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) return false
        if (where.readAt === null && n.readAt !== null) return false
        return true
      })
      filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const sliced = filtered.slice(skip, skip + take)
      if (include && include.actorUser) {
        return sliced.map((n) => ({ ...n, actorUser: null }))
      }
      return sliced
    },
    async findFirst({ where }) {
      return notifications.find((n) => {
        if (where.id && n.id !== where.id) return false
        if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) return false
        return true
      }) || null
    },
    async create({ data }) {
      const n = {
        id: `notif-${nextId++}`,
        ...data,
        createdAt: new Date(),
        actorUser: null,
      }
      notifications.push(n)
      return n
    },
    async update({ where, data }) {
      const n = notifications.find((item) => item.id === where.id)
      if (!n) throw new Error('Not found')
      Object.assign(n, data)
      return n
    },
    async updateMany({ where, data }) {
      let count = 0
      for (const n of notifications) {
        if (where.recipientUserId && n.recipientUserId !== where.recipientUserId) continue
        if (where.readAt === null && n.readAt !== null) continue
        Object.assign(n, data)
        count++
      }
      return { count }
    },
    async delete({ where }) {
      const index = notifications.findIndex((n) => n.id === where.id)
      if (index === -1) throw new Error('Not found')
      return notifications.splice(index, 1)[0]
    },
  },
  familyConnection: {
    async findMany() { return [] },
  },
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')

function tokenFor(userId, role) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
}

describeNotificationTests()

function describeNotificationTests() {
  let server
  let baseUrl

  before(async () => {
    server = app.listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve))
  })

  beforeEach(() => {
    notifications = []
    nextId = 1
  })

  async function request(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json()
    return { status: response.status, data }
  }

  test('GET /api/notifications requires authentication', async () => {
    const res = await request('/api/notifications')
    assert.equal(res.status, 401)
  })

  test('GET /api/notifications/unread-count requires authentication', async () => {
    const res = await request('/api/notifications/unread-count')
    assert.equal(res.status, 401)
  })

  test('GET /api/notifications returns empty list when no notifications exist', async () => {
    const token = tokenFor('user-1', 'ELDER')
    const res = await request('/api/notifications', { token })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.notifications, [])
    assert.equal(res.data.unreadCount, 0)
    assert.equal(res.data.pagination.total, 0)
  })

  test('GET /api/notifications returns only authenticated user notifications', async () => {
    makeNotification({ recipientUserId: 'user-1', title: 'For user 1' })
    makeNotification({ recipientUserId: 'user-2', title: 'For user 2' })

    const token1 = tokenFor('user-1', 'ELDER')
    const res1 = await request('/api/notifications', { token: token1 })
    assert.equal(res1.status, 200)
    assert.equal(res1.data.notifications.length, 1)
    assert.equal(res1.data.notifications[0].title, 'For user 1')

    const token2 = tokenFor('user-2', 'FAMILY')
    const res2 = await request('/api/notifications', { token: token2 })
    assert.equal(res2.status, 200)
    assert.equal(res2.data.notifications.length, 1)
    assert.equal(res2.data.notifications[0].title, 'For user 2')
  })

  test('GET /api/notifications supports unreadOnly filter', async () => {
    makeNotification({ recipientUserId: 'user-1', title: 'Unread' })
    makeNotification({ recipientUserId: 'user-1', title: 'Read', readAt: new Date() })

    const token = tokenFor('user-1', 'ELDER')
    const res = await request('/api/notifications?unreadOnly=true', { token })
    assert.equal(res.status, 200)
    assert.equal(res.data.notifications.length, 1)
    assert.equal(res.data.notifications[0].title, 'Unread')
  })

  test('GET /api/notifications supports pagination', async () => {
    for (let i = 0; i < 5; i++) {
      makeNotification({ recipientUserId: 'user-1', title: `Notification ${i}` })
    }
    const token = tokenFor('user-1', 'ELDER')

    const page1 = await request('/api/notifications?page=1&limit=3', { token })
    assert.equal(page1.status, 200)
    assert.equal(page1.data.notifications.length, 3)
    assert.equal(page1.data.pagination.total, 5)
    assert.equal(page1.data.pagination.totalPages, 2)

    const page2 = await request('/api/notifications?page=2&limit=3', { token })
    assert.equal(page2.status, 200)
    assert.equal(page2.data.notifications.length, 2)
  })

  test('GET /api/notifications/unread-count returns correct count', async () => {
    makeNotification({ recipientUserId: 'user-1' })
    makeNotification({ recipientUserId: 'user-1' })
    makeNotification({ recipientUserId: 'user-1', readAt: new Date() })

    const token = tokenFor('user-1', 'ELDER')
    const res = await request('/api/notifications/unread-count', { token })
    assert.equal(res.status, 200)
    assert.equal(res.data.unreadCount, 2)
  })

  test('PATCH /api/notifications/:id/read marks notification as read', async () => {
    const n = makeNotification({ recipientUserId: 'user-1' })
    const token = tokenFor('user-1', 'ELDER')
    const res = await request(`/api/notifications/${n.id}/read`, {
      method: 'PATCH',
      token,
    })
    assert.equal(res.status, 200)
    assert.ok(res.data.notification.read)
  })

  test('PATCH /api/notifications/:id/read returns 404 for another user notification', async () => {
    const n = makeNotification({ recipientUserId: 'user-2' })
    const token = tokenFor('user-1', 'ELDER')
    const res = await request(`/api/notifications/${n.id}/read`, {
      method: 'PATCH',
      token,
    })
    assert.equal(res.status, 404)
  })

  test('PATCH /api/notifications/mark-all-read marks all unread for user', async () => {
    makeNotification({ recipientUserId: 'user-1' })
    makeNotification({ recipientUserId: 'user-1' })
    makeNotification({ recipientUserId: 'user-2' })

    const token = tokenFor('user-1', 'ELDER')
    const res = await request('/api/notifications/mark-all-read', {
      method: 'PATCH',
      token,
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)

    const user2notif = notifications.find((n) => n.recipientUserId === 'user-2')
    assert.equal(user2notif.readAt, null)
  })

  test('DELETE /api/notifications/:id removes the notification', async () => {
    const n = makeNotification({ recipientUserId: 'user-1' })
    const token = tokenFor('user-1', 'ELDER')

    const res = await request(`/api/notifications/${n.id}`, {
      method: 'DELETE',
      token,
    })
    assert.equal(res.status, 200)
    assert.ok(res.data.message)

    const getRes = await request('/api/notifications', { token })
    assert.equal(getRes.data.notifications.length, 0)
  })

  test('DELETE /api/notifications/:id returns 404 for another user notification', async () => {
    const n = makeNotification({ recipientUserId: 'user-2' })
    const token = tokenFor('user-1', 'ELDER')

    const res = await request(`/api/notifications/${n.id}`, {
      method: 'DELETE',
      token,
    })
    assert.equal(res.status, 404)
  })

  test('GET /api/notifications rejects invalid limit param', async () => {
    const token = tokenFor('user-1', 'ELDER')
    const res = await request('/api/notifications?limit=999', { token })
    assert.equal(res.status, 400)
  })
}
