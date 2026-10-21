const prisma = require('../lib/prisma')
const notificationService = require('./notificationService')

class ConnectionError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const personSelect = { id: true, name: true }
const detailInclude = {
  family: { select: personSelect },
  elder: { select: personSelect },
}

function publicConnection(connection) {
  return {
    id: connection.id,
    familyId: connection.familyId,
    elderId: connection.elderId,
    relationship: connection.relationship,
    status: connection.status,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }
}

async function searchElders(query) {
  return prisma.user.findMany({
    where: {
      role: 'ELDER',
      OR: [{ name: { contains: query } }, { email: { contains: query } }],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 20,
  })
}

async function createRequest(familyId, elderId, relationship) {
  if (familyId === elderId) throw new ConnectionError(400, 'You cannot connect an account to itself.')

  const elder = await prisma.user.findUnique({ where: { id: elderId }, select: { id: true, role: true } })
  if (!elder) throw new ConnectionError(404, 'Elder account not found.')
  if (elder.role !== 'ELDER') throw new ConnectionError(400, 'Connection requests can only be sent to ELDER accounts.')

  const where = { familyId_elderId: { familyId, elderId } }
  const existing = await prisma.familyConnection.findUnique({ where })
  if (existing) {
    if (existing.status === 'REJECTED') {
      const reopened = await prisma.familyConnection.updateMany({
        where: { id: existing.id, status: 'REJECTED' },
        data: { relationship, status: 'PENDING' },
      })
      if (reopened.count === 1) return prisma.familyConnection.findUnique({ where: { id: existing.id } })
      throw new ConnectionError(409, 'A connection request is already active.')
    }
    throw new ConnectionError(409, existing.status === 'BLOCKED' ? 'This connection has been blocked.' : 'A connection already exists for this elder.')
  }

  try {
    const created = await prisma.familyConnection.create({ data: { familyId, elderId, relationship } })
    const familyUser = await prisma.user.findUnique({ where: { id: familyId }, select: { name: true } })
    await notificationService.createNotification({
      recipientUserId: elderId,
      actorUserId: familyId,
      type: 'CONNECTION_REQUEST',
      title: 'New Connection Request',
      message: `${familyUser?.name || 'A family member'} sent you a connection request (${relationship}).`,
      relatedEntityType: 'FAMILY_CONNECTION',
      relatedEntityId: created.id,
    }).catch(() => {})
    return created
  } catch (error) {
    if (error.code === 'P2002') throw new ConnectionError(409, 'A connection request is already active.')
    throw error
  }
}

async function listRequests(elderId) {
  const requests = await prisma.familyConnection.findMany({
    where: { elderId, status: 'PENDING' },
    include: { family: { select: personSelect } },
    orderBy: { createdAt: 'desc' },
  })
  return requests.map((connection) => ({
    id: connection.id,
    family: connection.family,
    relationship: connection.relationship,
    status: connection.status,
    createdAt: connection.createdAt,
  }))
}

async function respondToRequest(connectionId, elderId, status) {
  const connection = await prisma.familyConnection.findUnique({ where: { id: connectionId } })
  if (!connection || connection.elderId !== elderId) throw new ConnectionError(404, 'Connection request not found.')
  if (connection.status !== 'PENDING') throw new ConnectionError(409, 'Only pending requests can be accepted or rejected.')

  const result = await prisma.familyConnection.updateMany({
    where: { id: connectionId, elderId, status: 'PENDING' },
    data: { status },
  })
  if (result.count !== 1) throw new ConnectionError(409, 'The request has already been handled.')
  const updated = await prisma.familyConnection.findUnique({ where: { id: connectionId }, include: detailInclude })

  const elderUser = updated?.elder?.name || 'Your connected elder'
  if (status === 'ACCEPTED') {
    await notificationService.createNotification({
      recipientUserId: connection.familyId,
      actorUserId: elderId,
      type: 'CONNECTION_ACCEPTED',
      title: 'Connection Accepted',
      message: `${elderUser} accepted your connection request.`,
      relatedEntityType: 'FAMILY_CONNECTION',
      relatedEntityId: connectionId,
    }).catch(() => {})
  } else if (status === 'REJECTED') {
    await notificationService.createNotification({
      recipientUserId: connection.familyId,
      actorUserId: elderId,
      type: 'CONNECTION_REJECTED',
      title: 'Connection Request Declined',
      message: `${elderUser} declined your connection request.`,
      relatedEntityType: 'FAMILY_CONNECTION',
      relatedEntityId: connectionId,
    }).catch(() => {})
  }

  return updated
}

async function listFamilyConnections(familyId) {
  const connections = await prisma.familyConnection.findMany({
    where: { familyId },
    include: { elder: { select: personSelect } },
    orderBy: { updatedAt: 'desc' },
  })
  return connections.map((connection) => ({
    connectionId: connection.id,
    elder: connection.elder,
    relationship: connection.relationship,
    status: connection.status,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }))
}

async function listElderConnections(elderId) {
  const connections = await prisma.familyConnection.findMany({
    where: { elderId },
    include: { family: { select: personSelect } },
    orderBy: { updatedAt: 'desc' },
  })
  return connections.map((connection) => ({
    connectionId: connection.id,
    family: connection.family,
    relationship: connection.relationship,
    status: connection.status,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  }))
}

async function getConnectionDetails(connectionId, userId) {
  const connection = await prisma.familyConnection.findFirst({
    where: { id: connectionId, OR: [{ familyId: userId }, { elderId: userId }] },
    include: detailInclude,
  })
  if (!connection) throw new ConnectionError(404, 'Connection not found.')
  return connection
}

async function removeConnection(connectionId, userId) {
  const connection = await prisma.familyConnection.findUnique({ where: { id: connectionId } })
  if (!connection || (connection.familyId !== userId && connection.elderId !== userId)) {
    throw new ConnectionError(404, 'Connection not found.')
  }
  if (connection.status !== 'ACCEPTED') throw new ConnectionError(409, 'Only accepted connections can be removed.')

  const result = await prisma.familyConnection.updateMany({
    where: { id: connectionId, status: 'ACCEPTED', OR: [{ familyId: userId }, { elderId: userId }] },
    data: { status: 'BLOCKED' },
  })
  if (result.count !== 1) throw new ConnectionError(409, 'The connection has already changed.')
  return prisma.familyConnection.findUnique({ where: { id: connectionId }, include: detailInclude })
}

async function getConnectedElderProfile(familyId, elderId) {
  const connection = await prisma.familyConnection.findFirst({
    where: { familyId, elderId, status: 'ACCEPTED' },
    select: { id: true },
  })
  if (!connection) throw new ConnectionError(404, 'Connected elder profile not found.')
  const elder = await prisma.user.findFirst({
    where: { id: elderId, role: 'ELDER' },
    select: { id: true, name: true, phone: true, createdAt: true, updatedAt: true },
  })
  if (!elder) throw new ConnectionError(404, 'Connected elder profile not found.')
  return elder
}

module.exports = {
  ConnectionError,
  createRequest,
  getConnectedElderProfile,
  getConnectionDetails,
  listElderConnections,
  listFamilyConnections,
  listRequests,
  publicConnection,
  removeConnection,
  respondToRequest,
  searchElders,
}
