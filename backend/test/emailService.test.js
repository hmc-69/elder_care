const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')

const prismaPath = require.resolve('../src/lib/prisma')
const originalPrismaCache = require.cache[prismaPath]
const originalFetch = global.fetch
const originalApiKey = process.env.RESEND_API_KEY
const originalFrom = process.env.RESEND_FROM_EMAIL

const prismaMock = {
  familyConnection: {
    async findMany() {
      return [
        { family: { id: 'family-1', name: 'Family One', email: 'family1@example.com' } },
        { family: { id: 'family-2', name: 'Family Two', email: 'family2@example.com' } },
        { family: { id: 'family-3', name: 'No Email', email: null } },
      ]
    },
  },
}

require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: prismaMock,
}
const { buildSosEmail, sendSosEmails } = require('../src/services/emailService')

function configureResend() {
  process.env.RESEND_API_KEY = 'test-resend-key'
  process.env.RESEND_FROM_EMAIL = 'ElderCare Test <alerts@example.com>'
}

afterEach(() => {
  global.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalApiKey
  if (originalFrom === undefined) delete process.env.RESEND_FROM_EMAIL
  else process.env.RESEND_FROM_EMAIL = originalFrom
})

test('buildSosEmail escapes elder names and includes emergency guidance', () => {
  const email = buildSosEmail({
    elderName: '<script>alert(1)</script>',
    triggeredAt: '2026-10-25T08:00:00.000Z',
    frontendOrigin: 'https://eldercare.example',
  })

  assert.equal(email.html.includes('<script>'), false)
  assert.match(email.html, /&lt;script&gt;/)
  assert.match(email.text, /does not contact emergency services automatically/)
  assert.match(email.html, /https:\/\/eldercare\.example\//)
})

test('sendSosEmails sends one email per family recipient and uses event-recipient idempotency keys', async () => {
  configureResend()
  const calls = []
  global.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) })
    return { ok: true, status: 200 }
  }

  const result = await sendSosEmails({
    eventId: 'event-123',
    elderId: 'elder-123',
    elderName: 'Test Elder',
    triggeredAt: '2026-10-25T08:00:00.000Z',
  })

  assert.deepEqual(result, { sent: 2, failed: 0, skipped: false })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://api.resend.com/emails')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-resend-key')
  assert.equal(calls[0].options.headers['Idempotency-Key'], 'sos-event-123-family-1')
  assert.deepEqual(calls.map((call) => call.body.to[0]), ['family1@example.com', 'family2@example.com'])
})

test('sendSosEmails reports provider failures without throwing', async () => {
  configureResend()
  global.fetch = async () => ({ ok: false, status: 422, json: async () => ({ message: 'Invalid sender' }) })

  const result = await sendSosEmails({
    eventId: 'event-failed',
    elderId: 'elder-123',
    elderName: 'Test Elder',
    triggeredAt: new Date(),
  })

  assert.deepEqual(result, { sent: 0, failed: 2, skipped: false })
})

test('sendSosEmails skips safely when Resend is not configured', async () => {
  delete process.env.RESEND_API_KEY
  delete process.env.RESEND_FROM_EMAIL
  global.fetch = async () => { throw new Error('fetch should not be called') }

  const result = await sendSosEmails({ eventId: 'event-skip', elderId: 'elder-123', elderName: 'Test Elder', triggeredAt: new Date() })
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: true })
})

// Restore the module cache in case this file is loaded in a shared test process.
if (originalPrismaCache) require.cache[prismaPath] = originalPrismaCache
else delete require.cache[prismaPath]
