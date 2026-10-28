const assert = require('node:assert/strict')
const { test } = require('node:test')

const prismaPath = require.resolve('../src/lib/prisma')
const notificationPath = require.resolve('../src/services/notificationService')
const emailPath = require.resolve('../src/services/emailService')
const originalModules = new Map([
  [prismaPath, require.cache[prismaPath]],
  [notificationPath, require.cache[notificationPath]],
  [emailPath, require.cache[emailPath]],
])

const createdAt = new Date('2026-10-25T08:00:00.000Z')
const createdEvent = {
  id: 'sos-event-1',
  elderId: 'elder-1',
  status: 'ACTIVE',
  triggeredAt: createdAt,
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  cancelledAt: null,
  cancellationReason: null,
  notes: null,
  createdAt,
  updatedAt: createdAt,
  elder: { id: 'elder-1', name: 'Test Elder' },
}

const tx = {
  emergencyEvent: {
    async findFirst() { return null },
    async create() { return createdEvent },
  },
}
const prismaMock = {
  user: { async findFirst() { return { id: 'elder-1', name: 'Test Elder' } } },
  $transaction: async (callback) => callback(tx),
}

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock }
require.cache[notificationPath] = {
  id: notificationPath,
  filename: notificationPath,
  loaded: true,
  exports: { async notifyConnectedFamily() { return [] } },
}
require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: { async sendSosEmails() { throw new Error('Simulated SMTP outage') } },
}
const { triggerSos } = require('../src/services/sosService')

test('SOS activation remains successful if the email provider workflow throws', async () => {
  const result = await triggerSos('elder-1', {})
  assert.equal(result.event.id, 'sos-event-1')
  assert.equal(result.event.status, 'ACTIVE')
  assert.equal(result.message, 'SOS emergency alert activated.')
})

// Restore cache entries in shared-process runners.
for (const [path, cached] of originalModules) {
  if (cached) require.cache[path] = cached
  else delete require.cache[path]
}
