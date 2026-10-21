const assert = require('node:assert/strict')
const { after, before, test } = require('node:test')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = 'test_secret_only_never_used_outside_this_test_suite'

const users = []
const familyConnections = []
let nextId = 1

function person(user) {
  return user ? { id: user.id, name: user.name } : null
}

function withConnectionPeople(connection) {
  return {
    ...connection,
    family: person(users.find((user) => user.id === connection.familyId)),
    elder: (() => {
      const elder = users.find((user) => user.id === connection.elderId)
      return elder ? { id: elder.id, name: elder.name, phone: elder.phone } : null
    })(),
  }
}

function matchesConnection(connection, where) {
  if (where.id && connection.id !== where.id) return false
  if (where.familyId && connection.familyId !== where.familyId) return false
  if (where.elderId && connection.elderId !== where.elderId) return false
  if (where.status && connection.status !== where.status) return false
  if (where.OR && !where.OR.some((condition) => matchesConnection(connection, condition))) return false
  return true
}

const prismaMock = {
  user: {
    async create({ data }) {
      if (users.some((user) => user.email === data.email)) {
        const error = new Error('Unique constraint failed')
        error.code = 'P2002'
        throw error
      }
      const user = { id: `test-user-${nextId++}`, ...data, createdAt: new Date(), updatedAt: new Date() }
      users.push(user)
      return user
    },
    async findUnique({ where }) {
      return users.find((user) => user.id === where.id || user.email === where.email) ?? null
    },
    async findFirst({ where, select }) {
      const user = users.find((candidate) => (!where.id || candidate.id === where.id) && (!where.role || candidate.role === where.role))
      if (!user) return null
      if (!select) return user
      return Object.fromEntries(Object.keys(select).filter((key) => select[key]).map((key) => [key, user[key]]))
    },
    async findMany({ where }) {
      return users.filter((user) => user.role === where.role && where.OR.some((condition) => {
        const field = Object.keys(condition)[0]
        return user[field].toLowerCase().includes(condition[field].contains.toLowerCase())
      })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20).map(person)
    },
    async update({ where, data }) {
      const user = users.find((candidate) => candidate.id === where.id)
      if (!user) {
        const error = new Error('Record not found')
        error.code = 'P2025'
        throw error
      }
      Object.assign(user, data, { updatedAt: new Date() })
      return user
    },
  },
  familyConnection: {
    async findUnique({ where, include }) {
      const connection = where.familyId_elderId
        ? familyConnections.find((item) => item.familyId === where.familyId_elderId.familyId && item.elderId === where.familyId_elderId.elderId)
        : familyConnections.find((item) => item.id === where.id)
      if (!connection) return null
      return include ? withConnectionPeople(connection) : connection
    },
    async findFirst({ where, include }) {
      const connection = familyConnections.find((item) => matchesConnection(item, where))
      if (!connection) return null
      if (include) return withConnectionPeople(connection)
      return { id: connection.id }
    },
    async findMany({ where, include }) {
      return familyConnections.filter((item) => matchesConnection(item, where)).map((item) => {
        if (!include) return item
        return { ...item, [include.family ? 'family' : 'elder']: include.family ? person(users.find((user) => user.id === item.familyId)) : person(users.find((user) => user.id === item.elderId)) }
      })
    },
    async create({ data }) {
      if (familyConnections.some((item) => item.familyId === data.familyId && item.elderId === data.elderId)) {
        const error = new Error('Unique constraint failed')
        error.code = 'P2002'
        throw error
      }
      const connection = { id: `connection-${nextId++}`, ...data, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() }
      familyConnections.push(connection)
      return connection
    },
    async updateMany({ where, data }) {
      const connection = familyConnections.find((item) => matchesConnection(item, where))
      if (!connection) return { count: 0 }
      Object.assign(connection, data, { updatedAt: new Date() })
      return { count: 1 }
    },
  },
  async $disconnect() {},
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')

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

async function api(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { response, data: await response.json() }
}

test('Module 2 authentication and role authorization flows', async () => {
  const health = await api('/api/health')
  assert.equal(health.response.status, 200)
  assert.deepEqual(health.data, { status: 'ok', service: 'ElderCare Connect API' })

  const elderResult = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Elder One', email: 'elder@example.com', phone: '9876543210', password: 'elderpass123', role: 'ELDER' },
  })
  assert.equal(elderResult.response.status, 201)
  assert.equal('passwordHash' in elderResult.data.user, false)
  assert.equal(users[0].passwordHash === 'elderpass123', false)

  const familyResult = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Family One', email: 'family@example.com', password: 'familypass123', role: 'FAMILY' },
  })
  assert.equal(familyResult.response.status, 201)

  const duplicate = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Duplicate', email: 'ELDER@example.com', password: 'anotherpass123', role: 'ELDER' },
  })
  assert.equal(duplicate.response.status, 409)

  const adminRegistration = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Public Admin', email: 'admin@example.com', password: 'adminpass123', role: 'ADMIN' },
  })
  assert.equal(adminRegistration.response.status, 400)

  const invalidPhone = await api('/api/auth/register', {
    method: 'POST', body: { name: 'Invalid Phone', email: 'invalid@example.com', phone: 'abc', password: 'password123', role: 'ELDER' },
  })
  assert.equal(invalidPhone.response.status, 400)

  const elderLogin = await api('/api/auth/login', {
    method: 'POST', body: { email: 'elder@example.com', password: 'elderpass123' },
  })
  assert.equal(elderLogin.response.status, 200)
  assert.equal('passwordHash' in elderLogin.data.user, false)
  const elderToken = elderLogin.data.token

  const badLogin = await api('/api/auth/login', {
    method: 'POST', body: { email: 'elder@example.com', password: 'wrongpassword' },
  })
  assert.equal(badLogin.response.status, 401)
  assert.equal(badLogin.data.message, 'Invalid email or password.')

  assert.equal((await api('/api/auth/me')).response.status, 401)
  const currentUser = await api('/api/auth/me', { token: elderToken })
  assert.equal(currentUser.response.status, 200)
  assert.equal(currentUser.data.user.email, 'elder@example.com')
  assert.equal('passwordHash' in currentUser.data.user, false)
  assert.equal((await api('/api/auth/logout', { method: 'POST', token: elderToken })).response.status, 200)

  assert.equal((await api('/api/users/me', { token: elderToken })).response.status, 200)
  const profileUpdate = await api('/api/users/me', {
    method: 'PUT', token: elderToken, body: { name: 'Updated Elder', phone: '9876543211' },
  })
  assert.equal(profileUpdate.response.status, 200)
  assert.equal(profileUpdate.data.user.role, 'ELDER')
  assert.equal('passwordHash' in profileUpdate.data.user, false)

  const roleTampering = await api('/api/users/me', {
    method: 'PUT', token: elderToken, body: { name: 'Updated Elder', role: 'ADMIN' },
  })
  assert.equal(roleTampering.response.status, 400)

  assert.equal((await api('/api/users/me/password', { method: 'PUT', token: elderToken, body: { currentPassword: 'incorrect', newPassword: 'newpassword123' } })).response.status, 400)
  const changed = await api('/api/users/me/password', {
    method: 'PUT', token: elderToken, body: { currentPassword: 'elderpass123', newPassword: 'newpassword123' },
  })
  assert.equal(changed.response.status, 200)
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { email: 'elder@example.com', password: 'newpassword123' } })).response.status, 200)

  assert.equal((await api('/api/admin/test')).response.status, 401)
  const familyToken = (await api('/api/auth/login', { method: 'POST', body: { email: 'family@example.com', password: 'familypass123' } })).data.token
  assert.equal((await api('/api/admin/test', { token: elderToken })).response.status, 403)
  assert.equal((await api('/api/admin/test', { token: familyToken })).response.status, 403)

  users.push({
    id: `test-user-${nextId++}`, name: 'Test Admin', email: 'seeded-admin@example.com', phone: null,
    passwordHash: await bcrypt.hash('seededadmin123', 4), role: 'ADMIN', createdAt: new Date(), updatedAt: new Date(),
  })
  const adminLogin = await api('/api/auth/login', {
    method: 'POST', body: { email: 'seeded-admin@example.com', password: 'seededadmin123' },
  })
  assert.equal(adminLogin.response.status, 200)
  const adminAccess = await api('/api/admin/test', { token: adminLogin.data.token })
  assert.equal(adminAccess.response.status, 200)
})

test('invalid and expired bearer tokens are rejected', async () => {
  assert.equal((await api('/api/auth/me', { token: 'not-a-jwt' })).response.status, 401)
  const expired = jwt.sign({ role: 'ELDER' }, process.env.JWT_SECRET, { subject: 'expired-user', expiresIn: -1 })
  assert.equal((await api('/api/auth/me', { token: expired })).response.status, 401)
})

test('connection requests enforce roles, ownership, status, and elder-profile privacy', async () => {
  const family = users.find((user) => user.email === 'family@example.com')
  const elder = users.find((user) => user.email === 'elder@example.com')
  const familyToken = jwt.sign({ role: 'FAMILY' }, process.env.JWT_SECRET, { subject: family.id })
  const elderToken = jwt.sign({ role: 'ELDER' }, process.env.JWT_SECRET, { subject: elder.id })

  const secondElder = await prismaMock.user.create({ data: {
    name: 'Elder Two', email: 'elder2@example.com', phone: '9876543222', passwordHash: 'test-hash', role: 'ELDER',
  } })
  const secondFamily = await prismaMock.user.create({ data: {
    name: 'Family Two', email: 'family2@example.com', phone: null, passwordHash: 'test-hash', role: 'FAMILY',
  } })
  const secondFamilyToken = jwt.sign({ role: 'FAMILY' }, process.env.JWT_SECRET, { subject: secondFamily.id })
  const secondElderToken = jwt.sign({ role: 'ELDER' }, process.env.JWT_SECRET, { subject: secondElder.id })

  const search = await api('/api/family/elders/search?query=elder', { token: familyToken })
  assert.equal(search.response.status, 200)
  assert.deepEqual(search.data.users.map((user) => user.name), ['Elder Two', 'Updated Elder'])
  assert.ok(search.data.users.every((user) => !('passwordHash' in user) && !('email' in user)))
  assert.equal((await api('/api/family/elders/search?query=x', { token: familyToken })).response.status, 400)
  assert.equal((await api('/api/family/elders/search?query=elder', { token: elderToken })).response.status, 403)

  const sent = await api('/api/connections', {
    method: 'POST', token: familyToken, body: { elderId: elder.id, relationship: 'Daughter' },
  })
  assert.equal(sent.response.status, 201)
  assert.equal(sent.data.connection.status, 'PENDING')
  const connectionId = sent.data.connection.id
  assert.equal((await api('/api/connections', { method: 'POST', token: familyToken, body: { elderId: elder.id, relationship: 'Daughter' } })).response.status, 409)
  assert.equal((await api('/api/connections', { method: 'POST', token: elderToken, body: { elderId: secondElder.id, relationship: 'Parent' } })).response.status, 403)
  assert.equal((await api('/api/connections', { method: 'POST', token: familyToken, body: { elderId: secondFamily.id, relationship: 'Sibling' } })).response.status, 400)

  const elderRequests = await api('/api/connections/requests', { token: elderToken })
  assert.equal(elderRequests.response.status, 200)
  assert.equal(elderRequests.data[0].family.name, 'Family One')
  assert.equal((await api('/api/connections/requests', { token: familyToken })).response.status, 403)
  assert.equal((await api(`/api/connections/${connectionId}/accept`, { method: 'PUT', token: secondElderToken })).response.status, 404)
  assert.equal((await api(`/api/connections/${connectionId}`, { token: secondFamilyToken })).response.status, 404)

  const familyList = await api('/api/connections/family', { token: familyToken })
  assert.equal(familyList.data[0].status, 'PENDING')
  const accepted = await api(`/api/connections/${connectionId}/accept`, { method: 'PUT', token: elderToken })
  assert.equal(accepted.response.status, 200)
  assert.equal(accepted.data.connection.status, 'ACCEPTED')
  assert.equal((await api(`/api/connections/${connectionId}/accept`, { method: 'PUT', token: elderToken })).response.status, 409)

  const connectedProfile = await api(`/api/family/elders/${elder.id}`, { token: familyToken })
  assert.equal(connectedProfile.response.status, 200)
  assert.equal(connectedProfile.data.elder.name, 'Updated Elder')
  assert.equal('passwordHash' in connectedProfile.data.elder, false)
  assert.equal((await api(`/api/family/elders/${elder.id}`, { token: secondFamilyToken })).response.status, 404)
  const elderConnections = await api('/api/connections/elder', { token: elderToken })
  assert.equal(elderConnections.data[0].family.name, 'Family One')
  assert.equal((await api(`/api/connections/${connectionId}`, { token: elderToken })).response.status, 200)

  const removed = await api(`/api/connections/${connectionId}`, { method: 'DELETE', token: familyToken })
  assert.equal(removed.response.status, 200)
  assert.equal(removed.data.connection.status, 'BLOCKED')
  assert.equal((await api(`/api/family/elders/${elder.id}`, { token: familyToken })).response.status, 404)
  assert.equal((await api('/api/connections', { method: 'POST', token: familyToken, body: { elderId: elder.id, relationship: 'Daughter' } })).response.status, 409)

  const rejectedRequest = await api('/api/connections', {
    method: 'POST', token: secondFamilyToken, body: { elderId: secondElder.id, relationship: 'Caregiver' },
  })
  assert.equal(rejectedRequest.response.status, 201)
  const rejected = await api(`/api/connections/${rejectedRequest.data.connection.id}/reject`, { method: 'PUT', token: secondElderToken })
  assert.equal(rejected.response.status, 200)
  assert.equal(rejected.data.connection.status, 'REJECTED')
  assert.equal((await api(`/api/family/elders/${secondElder.id}`, { token: secondFamilyToken })).response.status, 404)
  const retry = await api('/api/connections', {
    method: 'POST', token: secondFamilyToken, body: { elderId: secondElder.id, relationship: 'Relative' },
  })
  assert.equal(retry.response.status, 201)
  assert.equal(retry.data.connection.status, 'PENDING')
})
