const assert = require('node:assert/strict')
const { after, before, beforeEach, test } = require('node:test')
const jwt = require('jsonwebtoken')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'assistant_test_secret_only_never_used_outside_this_test_12345'
process.env.APP_TIMEZONE = 'UTC'
process.env.AI_PROVIDER = 'mock'

const users = [
  { id: 'elder-1', role: 'ELDER', name: 'Elder Alice' },
  { id: 'elder-2', role: 'ELDER', name: 'Elder Bob' },
  { id: 'family-1', role: 'FAMILY', name: 'Family Charlie' },
]

const medications = [
  {
    id: 'med-1',
    elderId: 'elder-1',
    name: 'Metformin',
    dosage: '500mg',
    frequency: 'TWICE_DAILY',
    times: ['08:00', '20:00'],
    instructions: 'Take with food',
    active: true,
  },
]

const checkIns = [
  {
    id: 'check-1',
    elderId: 'elder-1',
    period: 'MORNING',
    status: 'COMPLETED',
    checkedInAt: new Date(),
    checkinDate: new Date(),
  },
]

let conversations = []
let chatMessages = []
let nextId = 1

const prismaMock = {
  user: {
    async findUnique({ where }) {
      return users.find((u) => u.id === where.id) || null
    },
    async findFirst({ where, select }) {
      const u = users.find((item) => item.id === where.id && (!where.role || item.role === where.role))
      if (!u) return null
      return select ? Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, u[k]])) : u
    },
  },
  medication: {
    async findMany({ where }) {
      return medications.filter((m) => m.elderId === where.elderId && (where.active === undefined || m.active === where.active))
    },
  },
  checkIn: {
    async findMany({ where }) {
      return checkIns.filter((c) => c.elderId === where.elderId)
    },
  },
  conversation: {
    async create({ data }) {
      const row = {
        id: `conv-${nextId++}`,
        userId: data.userId,
        title: data.title,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      conversations.push(row)
      return row
    },
    async findFirst({ where, include }) {
      const item = conversations.find((c) => c.id === where.id && (!where.userId || c.userId === where.userId))
      if (!item) return null
      if (include?.messages) {
        const msgs = chatMessages
          .filter((m) => m.conversationId === item.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        return { ...item, messages: msgs }
      }
      return item
    },
    async findMany({ where, skip = 0, take = 20, include }) {
      const filtered = conversations
        .filter((c) => !where?.userId || c.userId === where.userId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      const sliced = filtered.slice(skip, skip + take)
      if (include?._count || include?.messages) {
        return sliced.map((c) => {
          const msgs = chatMessages
            .filter((m) => m.conversationId === c.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          return {
            ...c,
            _count: { messages: msgs.length },
            messages: msgs.slice(0, 1),
          }
        })
      }
      return sliced
    },
    async count({ where }) {
      return conversations.filter((c) => !where?.userId || c.userId === where.userId).length
    },
    async update({ where, data }) {
      const item = conversations.find((c) => c.id === where.id)
      if (!item) throw new Error('Not found')
      Object.assign(item, data, { updatedAt: new Date() })
      return item
    },
    async delete({ where }) {
      const index = conversations.findIndex((c) => c.id === where.id)
      if (index === -1) throw new Error('Not found')
      const deleted = conversations.splice(index, 1)[0]
      chatMessages = chatMessages.filter((m) => m.conversationId !== where.id)
      return deleted
    },
  },
  chatMessage: {
    async create({ data }) {
      const row = {
        id: `msg-${nextId++}`,
        conversationId: data.conversationId,
        role: data.role,
        content: data.content,
        createdAt: new Date(),
      }
      chatMessages.push(row)
      return row
    },
    async findMany({ where, take = 10 }) {
      const msgs = chatMessages.filter((m) => m.conversationId === where.conversationId)
      return msgs.slice(-take)
    },
  },
  $transaction: async (fn) => fn(prismaMock),
}

const prismaPath = require.resolve('../src/lib/prisma')
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
const app = require('../src/index')
const { getAIProvider, MockProvider, AIProviderError } = require('../src/services/aiProvider')
const { _testResetRateLimits } = require('../src/services/assistantService')

function tokenFor(userId, role) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' })
}

describeAssistantTests()

function describeAssistantTests() {
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
    conversations = []
    chatMessages = []
    nextId = 1
    _testResetRateLimits()
    const provider = getAIProvider()
    if (provider instanceof MockProvider) {
      provider.reset()
    }
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

  test('POST /api/assistant/chat requires authentication', async () => {
    const result = await request('/api/assistant/chat', {
      method: 'POST',
      body: { message: 'Hello' },
    })
    assert.equal(result.status, 401)
  })

  test('POST /api/assistant/chat validates message length and payload format', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const emptyResult = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: '' },
    })
    assert.equal(emptyResult.status, 400)

    const whitespaceResult = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: '    ' },
    })
    assert.equal(whitespaceResult.status, 400)

    const tooLongResult = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'A'.repeat(2001) },
    })
    assert.equal(tooLongResult.status, 400)

    const nonStringResult = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 12345 },
    })
    assert.equal(nonStringResult.status, 400)
  })

  test('POST /api/assistant/chat creates a new conversation and persists messages', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const res = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'How should I stay hydrated today?' },
    })

    assert.equal(res.status, 200)
    assert.ok(res.data.conversationId)
    assert.ok(res.data.title)
    assert.equal(res.data.userMessage.role, 'USER')
    assert.equal(res.data.userMessage.content, 'How should I stay hydrated today?')
    assert.equal(res.data.message.role, 'ASSISTANT')
    assert.ok(res.data.message.content.length > 0)
    assert.ok(res.data.disclaimer)

    // Check persistence
    assert.equal(conversations.length, 1)
    assert.equal(conversations[0].userId, 'elder-1')
    assert.equal(chatMessages.length, 2)
  })

  test('POST /api/assistant/chat appends to existing conversation when conversationId is provided', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const first = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Tell me about morning stretches.' },
    })
    assert.equal(first.status, 200)
    const convId = first.data.conversationId

    const second = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Thank you, anything else?', conversationId: convId },
    })
    assert.equal(second.status, 200)
    assert.equal(second.data.conversationId, convId)

    // Ensure conversation count is still 1 and 4 messages exist in it
    assert.equal(conversations.length, 1)
    assert.equal(chatMessages.length, 4)
  })

  test('Conversation ownership is strictly enforced: other user cannot access or append', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')
    const otherToken = tokenFor('elder-2', 'ELDER')

    // Elder 1 creates conversation
    const first = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Private message from elder 1' },
    })
    const convId = first.data.conversationId

    // Elder 2 tries to append message
    const appendOther = await request('/api/assistant/chat', {
      method: 'POST',
      token: otherToken,
      body: { message: 'Intruder message', conversationId: convId },
    })
    assert.equal(appendOther.status, 404)

    // Elder 2 tries to read conversation
    const readOther = await request(`/api/assistant/conversations/${convId}`, {
      token: otherToken,
    })
    assert.equal(readOther.status, 404)

    // Elder 2 tries to patch title
    const patchOther = await request(`/api/assistant/conversations/${convId}`, {
      method: 'PATCH',
      token: otherToken,
      body: { title: 'Hacked title' },
    })
    assert.equal(patchOther.status, 404)

    // Elder 2 tries to delete conversation
    const deleteOther = await request(`/api/assistant/conversations/${convId}`, {
      method: 'DELETE',
      token: otherToken,
    })
    assert.equal(deleteOther.status, 404)
  })

  test('GET /api/assistant/conversations lists only authenticated user conversations with pagination', async () => {
    const elder1Token = tokenFor('elder-1', 'ELDER')
    const elder2Token = tokenFor('elder-2', 'ELDER')

    // Create 2 conversations for elder 1
    await request('/api/assistant/chat', {
      method: 'POST',
      token: elder1Token,
      body: { message: 'Topic 1' },
    })
    await request('/api/assistant/chat', {
      method: 'POST',
      token: elder1Token,
      body: { message: 'Topic 2' },
    })

    // Create 1 conversation for elder 2
    await request('/api/assistant/chat', {
      method: 'POST',
      token: elder2Token,
      body: { message: 'Elder 2 topic' },
    })

    const list1 = await request('/api/assistant/conversations?page=1&limit=10', {
      token: elder1Token,
    })
    assert.equal(list1.status, 200)
    assert.equal(list1.data.conversations.length, 2)
    assert.equal(list1.data.pagination.total, 2)

    const list2 = await request('/api/assistant/conversations?page=1&limit=10', {
      token: elder2Token,
    })
    assert.equal(list2.status, 200)
    assert.equal(list2.data.conversations.length, 1)
  })

  test('PATCH and DELETE conversation endpoints work for owner', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const createRes = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Initial question' },
    })
    const convId = createRes.data.conversationId

    // Rename
    const patchRes = await request(`/api/assistant/conversations/${convId}`, {
      method: 'PATCH',
      token: elderToken,
      body: { title: 'Updated Custom Title' },
    })
    assert.equal(patchRes.status, 200)
    assert.equal(patchRes.data.conversation.title, 'Updated Custom Title')

    // Delete
    const deleteRes = await request(`/api/assistant/conversations/${convId}`, {
      method: 'DELETE',
      token: elderToken,
    })
    assert.equal(deleteRes.status, 200)

    // Confirm deleted
    const getRes = await request(`/api/assistant/conversations/${convId}`, {
      token: elderToken,
    })
    assert.equal(getRes.status, 404)
  })

  test('Handles provider errors and timeouts without persisting fabricated assistant answers', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')
    const provider = getAIProvider()

    // Inject provider failure
    provider.setMockFailure(
      new AIProviderError({
        message: 'The AI assistant timed out while generating a response.',
        status: 504,
        code: 'PROVIDER_TIMEOUT',
      })
    )

    const failRes = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Will this trigger timeout?' },
    })

    assert.equal(failRes.status, 504)
    assert.ok(failRes.data.message.includes('timed out'))
    // Verify no conversation or message was persisted
    assert.equal(conversations.length, 0)
    assert.equal(chatMessages.length, 0)
  })

  test('Safety: Emergency language returns emergency guidance and recommends immediate emergency contact', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const res = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'I am having severe chest pain and cannot breathe' },
    })

    assert.equal(res.status, 200)
    const reply = res.data.message.content.toLowerCase()
    assert.ok(reply.includes('emergency') || reply.includes('911') || reply.includes('sos'))
  })

  test('Safety: Medication alterations are refused and user is directed to their doctor', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const res = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'Should I double the dose of my medicine?' },
    })

    assert.equal(res.status, 200)
    const reply = res.data.message.content.toLowerCase()
    assert.ok(reply.includes('doctor') || reply.includes('pharmacist') || reply.includes('cannot prescribe'))
  })

  test('Authorized context provides medication information to elder without exposing secrets', async () => {
    const elderToken = tokenFor('elder-1', 'ELDER')

    const res = await request('/api/assistant/chat', {
      method: 'POST',
      token: elderToken,
      body: { message: 'What is my medication schedule?' },
    })

    assert.equal(res.status, 200)
    assert.ok(res.data.message.content.includes('Metformin'))
    // Ensure no secrets or API keys in response
    assert.equal(JSON.stringify(res.data).includes('JWT_SECRET'), false)
    assert.equal(JSON.stringify(res.data).includes('AI_API_KEY'), false)
  })
}
