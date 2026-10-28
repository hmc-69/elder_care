const assert = require('node:assert/strict')
const { test } = require('node:test')
const { buildSosEmail, createEmailService } = require('../src/services/emailService')

function mockConnections() {
  return [
    { status: 'ACCEPTED', family: { id: 'family-1', name: 'One', email: 'one@example.com' } },
    { status: 'ACCEPTED', family: { id: 'family-2', name: 'Two', email: 'two@example.com' } },
    { status: 'PENDING', family: { id: 'pending', name: 'Pending', email: 'pending@example.com' } },
    { status: 'REJECTED', family: { id: 'rejected', name: 'Rejected', email: 'rejected@example.com' } },
    { status: 'BLOCKED', family: { id: 'blocked', name: 'Blocked', email: 'blocked@example.com' } },
    { status: 'ACCEPTED', family: { id: 'no-email', name: 'No Email', email: null } },
    { status: 'ACCEPTED', family: { id: 'empty-email', name: 'Empty Email', email: '  ' } },
  ]
}

const silentLogger = { info() {}, error() {} }
const env = {
  EMAIL_USER: 'sender@gmail.com',
  EMAIL_APP_PASSWORD: 'not-a-real-password',
  EMAIL_FROM_NAME: 'ElderCare Connect',
  FRONTEND_ORIGIN: 'https://eldercare.example',
}

test('buildSosEmail escapes untrusted elder names and includes time and emergency guidance', () => {
  const email = buildSosEmail({
    elderName: '<script>alert(1)</script>',
    triggeredAt: '2026-10-25T08:00:00.000Z',
    frontendOrigin: 'https://eldercare.example',
  })

  assert.equal(email.html.includes('<script>'), false)
  assert.match(email.html, /&lt;script&gt;/)
  assert.match(email.text, /<script>alert\(1\)<\/script>/)
  assert.match(email.text, /2026|Oct|25/)
  assert.match(email.text, /contact local emergency services if needed/)
  assert.match(email.text, /does not contact emergency services automatically/)
  assert.match(email.html, /https:\/\/eldercare\.example\//)
})

test('sends one separate email per eligible family member, excluding missing and empty emails', async () => {
  const calls = []
  const service = createEmailService({
    env,
    logger: silentLogger,
    database: { familyConnection: { async findMany(query) {
      assert.deepEqual(query.where, { elderId: 'elder-1', status: 'ACCEPTED' })
      return mockConnections().filter((connection) => connection.status === query.where.status)
    } } },
    mailTransport: { async sendMail(message) { calls.push(message); return { accepted: [message.to] } } },
  })
  const result = await service.sendSosEmails({ eventId: 'event-1', elderId: 'elder-1', elderName: 'Test Elder', triggeredAt: '2026-10-25T08:00:00Z' })

  assert.deepEqual(result, { sent: 2, failed: 0, skipped: false })
  assert.deepEqual(calls.map((call) => call.to), ['one@example.com', 'two@example.com'])
  assert.deepEqual(calls[0].from, { name: 'ElderCare Connect', address: 'sender@gmail.com' })
  assert.equal(calls[0].subject.includes('Test Elder'), true)
  assert.match(calls[0].text, /Test Elder/)
})

test('attempts all eligible recipients after one SMTP failure', async () => {
  const attempted = []
  const service = createEmailService({
    env,
    logger: silentLogger,
    database: { familyConnection: { async findMany() { return mockConnections().slice(0, 2) } } },
    mailTransport: { async sendMail(message) {
      attempted.push(message.to)
      if (message.to === 'one@example.com') throw Object.assign(new Error('failed'), { code: 'ESMTP' })
      return {}
    } },
  })
  const result = await service.sendSosEmails({ eventId: 'event-2', elderId: 'elder-1', elderName: 'Test Elder', triggeredAt: new Date() })

  assert.deepEqual(attempted, ['one@example.com', 'two@example.com'])
  assert.deepEqual(result, { sent: 1, failed: 1, skipped: false })
})

test('missing SMTP configuration skips safely without looking up recipients', async () => {
  const service = createEmailService({
    env: {},
    logger: silentLogger,
    database: { familyConnection: { async findMany() { throw new Error('should not query') } } },
  })
  const result = await service.sendSosEmails({ eventId: 'event-3', elderId: 'elder-1', elderName: 'Test Elder', triggeredAt: new Date() })
  assert.deepEqual(result, { sent: 0, failed: 0, skipped: true })
})

test('recipient lookup failure is contained and reported without throwing', async () => {
  const service = createEmailService({
    env,
    logger: silentLogger,
    database: { familyConnection: { async findMany() { throw Object.assign(new Error('db failed'), { code: 'DB_DOWN' }) } } },
    mailTransport: { async sendMail() { throw new Error('should not send') } },
  })
  const result = await service.sendSosEmails({ eventId: 'event-4', elderId: 'elder-1', elderName: 'Test Elder', triggeredAt: new Date() })
  assert.deepEqual(result, { sent: 0, failed: 1, skipped: false })
})
