const prisma = require('../lib/prisma')
const notificationService = require('./notificationService')
const emailService = require('./emailService')

const SOS_DISCLAIMER =
  'This service alerts connected family members through in-app notifications and, when configured, email. It does not contact 911, local emergency services, or medical dispatchers. If you are in immediate danger, please contact your local emergency services directly.'

class SosError extends Error {
  constructor(status, message, event = null) {
    super(message)
    this.status = status
    this.event = event
  }
}

function formatEvent(event) {
  if (!event) return null
  return {
    id: event.id,
    elderId: event.elderId,
    elderName: event.elder?.name ?? null,
    status: event.status,
    triggeredAt: event.triggeredAt,
    acknowledgedAt: event.acknowledgedAt,
    acknowledgedBy: event.acknowledgedBy
      ? { id: event.acknowledgedBy.id, name: event.acknowledgedBy.name }
      : null,
    resolvedAt: event.resolvedAt,
    resolvedBy: event.resolvedBy
      ? { id: event.resolvedBy.id, name: event.resolvedBy.name }
      : null,
    cancelledAt: event.cancelledAt,
    cancellationReason: event.cancellationReason,
    notes: event.notes,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  }
}

async function verifyElderExists(elderId) {
  const elder = await prisma.user.findFirst({
    where: { id: elderId, role: 'ELDER' },
    select: { id: true, name: true },
  })
  if (!elder) throw new SosError(404, 'Elder account not found.')
  return elder
}

async function verifyAcceptedConnection(familyId, elderId) {
  const connection = await prisma.familyConnection.findFirst({
    where: { familyId, elderId, status: 'ACCEPTED' },
    select: { id: true },
  })
  if (!connection) throw new SosError(404, 'Connected elder emergency information not found.')
  return connection
}

async function triggerSos(elderId, data = {}) {
  await verifyElderExists(elderId)

  // Use a transaction to safely check and prevent duplicate concurrent active events
  const created = await prisma.$transaction(async (tx) => {
    const existing = await tx.emergencyEvent.findFirst({
      where: {
        elderId,
        status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
      },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
      orderBy: { triggeredAt: 'desc' },
    })

    if (existing) {
      throw new SosError(
        409,
        'An emergency alert is already active for this account.',
        formatEvent(existing)
      )
    }

    return tx.emergencyEvent.create({
      data: {
        elderId,
        status: 'ACTIVE',
        triggeredAt: new Date(),
        notes: data.notes || null,
      },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    })
  })

  await notificationService.notifyConnectedFamily({
    elderId,
    actorUserId: elderId,
    type: 'SOS_TRIGGERED',
    title: 'EMERGENCY: SOS Alert Triggered!',
    message: `${created.elder?.name || 'Your connected elder'} triggered an SOS emergency alert. Please check immediately.`,
    relatedEntityType: 'EMERGENCY_EVENT',
    relatedEntityId: created.id,
  }).catch(() => {})

  // The emergency event is already committed. Email errors must never roll it back
  // or turn a successful SOS activation into an API failure.
  await emailService.sendSosEmails({
    eventId: created.id,
    elderId,
    elderName: created.elder?.name || 'Your connected elder',
    triggeredAt: created.triggeredAt,
  }).catch((error) => {
    console.error('[email] SOS email workflow failed:', error?.code || error?.name || 'UnknownError')
  })

  return {
    message: 'SOS emergency alert activated.',
    event: formatEvent(created),
    disclaimer: SOS_DISCLAIMER,
  }
}

async function getActiveElderSos(elderId) {
  await verifyElderExists(elderId)
  const event = await prisma.emergencyEvent.findFirst({
    where: {
      elderId,
      status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
    },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    orderBy: { triggeredAt: 'desc' },
  })
  return event ? formatEvent(event) : null
}

async function getElderSosHistory(elderId, { page = 1, limit = 10 } = {}) {
  await verifyElderExists(elderId)
  const skip = (page - 1) * limit
  const [total, items] = await Promise.all([
    prisma.emergencyEvent.count({ where: { elderId } }),
    prisma.emergencyEvent.findMany({
      where: { elderId },
      skip,
      take: limit,
      orderBy: { triggeredAt: 'desc' },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    }),
  ])

  return {
    events: items.map(formatEvent),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    disclaimer: SOS_DISCLAIMER,
  }
}

async function getEventById(eventId, auth) {
  const event = await prisma.emergencyEvent.findFirst({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })
  if (!event) throw new SosError(404, 'Emergency event not found.')

  if (auth.role === 'ELDER') {
    if (event.elderId !== auth.userId) throw new SosError(404, 'Emergency event not found.')
  } else if (auth.role === 'FAMILY') {
    await verifyAcceptedConnection(auth.userId, event.elderId)
  }

  return formatEvent(event)
}

async function cancelSos(eventId, elderId, { reason } = {}) {
  await verifyElderExists(elderId)

  const event = await prisma.emergencyEvent.findFirst({
    where: { id: eventId, elderId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })
  if (!event) throw new SosError(404, 'Emergency event not found.')

  if (event.status === 'CANCELLED') {
    throw new SosError(409, 'This emergency alert is already cancelled.', formatEvent(event))
  }
  if (event.status === 'RESOLVED') {
    throw new SosError(
      409,
      'This emergency alert has already been resolved and cannot be cancelled.',
      formatEvent(event)
    )
  }
  if (event.status === 'ACKNOWLEDGED') {
    throw new SosError(
      409,
      'This emergency alert has already been acknowledged by family. Please contact your family to resolve it.',
      formatEvent(event)
    )
  }
  if (event.status !== 'ACTIVE') {
    throw new SosError(409, 'Only active emergency alerts can be cancelled.', formatEvent(event))
  }

  const result = await prisma.emergencyEvent.updateMany({
    where: { id: eventId, elderId, status: 'ACTIVE' },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancellationReason: reason || 'Accidental activation cancelled by elder',
    },
  })

  if (result.count !== 1) {
    const current = await prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    })
    throw new SosError(409, 'Unable to cancel this alert. It may have already been acknowledged or resolved.', formatEvent(current))
  }

  const updated = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })

  await notificationService.notifyConnectedFamily({
    elderId,
    actorUserId: elderId,
    type: 'SOS_CANCELLED',
    title: 'SOS Alert Cancelled',
    message: `${updated?.elder?.name || 'Elder'} cancelled their emergency alert (false alarm).`,
    relatedEntityType: 'EMERGENCY_EVENT',
    relatedEntityId: eventId,
  }).catch(() => {})

  return {
    message: 'Emergency alert cancelled.',
    event: formatEvent(updated),
  }
}

async function getFamilyElderSos(familyId, elderId, { page = 1, limit = 10 } = {}) {
  await verifyAcceptedConnection(familyId, elderId)
  const elder = await verifyElderExists(elderId)

  const skip = (page - 1) * limit
  const [activeEvent, total, items] = await Promise.all([
    prisma.emergencyEvent.findFirst({
      where: { elderId, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
      orderBy: { triggeredAt: 'desc' },
    }),
    prisma.emergencyEvent.count({ where: { elderId } }),
    prisma.emergencyEvent.findMany({
      where: { elderId },
      skip,
      take: limit,
      orderBy: { triggeredAt: 'desc' },
      include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    }),
  ])

  return {
    elder: { id: elder.id, name: elder.name },
    activeEvent: activeEvent ? formatEvent(activeEvent) : null,
    history: items.map(formatEvent),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    disclaimer: SOS_DISCLAIMER,
  }
}

async function getFamilyActiveEmergencies(familyId) {
  const connections = await prisma.familyConnection.findMany({
    where: { familyId, status: 'ACCEPTED' },
    select: { elderId: true },
  })
  if (!connections.length) return []

  const elderIds = connections.map((c) => c.elderId)
  const activeEvents = await prisma.emergencyEvent.findMany({
    where: {
      elderId: { in: elderIds },
      status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
    },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
    orderBy: { triggeredAt: 'desc' },
  })

  return activeEvents.map(formatEvent)
}

async function acknowledgeSos(eventId, familyId) {
  const event = await prisma.emergencyEvent.findFirst({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })
  if (!event) throw new SosError(404, 'Emergency event not found.')

  await verifyAcceptedConnection(familyId, event.elderId)

  if (event.status === 'CANCELLED') {
    throw new SosError(409, 'This emergency alert was cancelled by the elder and cannot be acknowledged.', formatEvent(event))
  }
  if (event.status === 'RESOLVED') {
    throw new SosError(409, 'This emergency alert is already resolved.', formatEvent(event))
  }
  if (event.status === 'ACKNOWLEDGED') {
    // Idempotent handling for concurrent acknowledgements
    return {
      message: `Emergency alert was already acknowledged by ${event.acknowledgedBy?.name || 'another family member'}.`,
      event: formatEvent(event),
    }
  }

  const result = await prisma.emergencyEvent.updateMany({
    where: { id: eventId, status: 'ACTIVE' },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(),
      acknowledgedById: familyId,
    },
  })

  const updated = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })

  if (result.count !== 1) {
    if (updated?.status === 'ACKNOWLEDGED') {
      return {
        message: `Emergency alert was already acknowledged by ${updated.acknowledgedBy?.name || 'another family member'}.`,
        event: formatEvent(updated),
      }
    }
    throw new SosError(409, 'Unable to acknowledge alert due to concurrent status change.', formatEvent(updated))
  }

  await notificationService.createNotification({
    recipientUserId: event.elderId,
    actorUserId: familyId,
    type: 'SOS_ACKNOWLEDGED',
    title: 'Emergency Alert Acknowledged',
    message: `${updated?.acknowledgedBy?.name || 'A family member'} acknowledged your emergency alert.`,
    relatedEntityType: 'EMERGENCY_EVENT',
    relatedEntityId: eventId,
  }).catch(() => {})

  return {
    message: 'Emergency alert acknowledged successfully. Your elder and family can see that you are responding.',
    event: formatEvent(updated),
  }
}

async function resolveSos(eventId, familyId, { notes } = {}) {
  const event = await prisma.emergencyEvent.findFirst({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })
  if (!event) throw new SosError(404, 'Emergency event not found.')

  await verifyAcceptedConnection(familyId, event.elderId)

  if (event.status === 'CANCELLED') {
    throw new SosError(409, 'This emergency alert was cancelled and cannot be resolved.', formatEvent(event))
  }
  if (event.status === 'RESOLVED') {
    throw new SosError(409, 'This emergency alert is already marked as resolved.', formatEvent(event))
  }
  if (event.status !== 'ACTIVE' && event.status !== 'ACKNOWLEDGED') {
    throw new SosError(409, 'Only active or acknowledged alerts can be resolved.', formatEvent(event))
  }

  const result = await prisma.emergencyEvent.updateMany({
    where: { id: eventId, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
    data: {
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolvedById: familyId,
      notes: notes || event.notes || null,
    },
  })

  const updated = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: { elder: true, acknowledgedBy: true, resolvedBy: true },
  })

  if (result.count !== 1) {
    if (updated?.status === 'RESOLVED') {
      return {
        message: 'This emergency alert is already marked as resolved.',
        event: formatEvent(updated),
      }
    }
    throw new SosError(409, 'Unable to resolve alert due to concurrent status change.', formatEvent(updated))
  }

  await notificationService.createNotification({
    recipientUserId: event.elderId,
    actorUserId: familyId,
    type: 'SOS_RESOLVED',
    title: 'Emergency Alert Resolved',
    message: `Your emergency alert was marked as resolved by ${updated?.resolvedBy?.name || 'family'}.`,
    relatedEntityType: 'EMERGENCY_EVENT',
    relatedEntityId: eventId,
  }).catch(() => {})

  return {
    message: 'Emergency alert resolved.',
    event: formatEvent(updated),
  }
}

module.exports = {
  SOS_DISCLAIMER,
  SosError,
  acknowledgeSos,
  cancelSos,
  formatEvent,
  getActiveElderSos,
  getElderSosHistory,
  getEventById,
  getFamilyActiveEmergencies,
  getFamilyElderSos,
  resolveSos,
  triggerSos,
}
