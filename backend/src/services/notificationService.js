const prisma = require('../lib/prisma')

class NotificationError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
    this.name = 'NotificationError'
  }
}

/**
 * Creates an in-app notification idempotently.
 * If relatedEntityType and relatedEntityId are provided, checks if an identical notification
 * has already been created for this recipient to prevent duplicates on repeated API calls.
 */
async function createNotification({
  recipientUserId,
  actorUserId = null,
  type,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null,
  tx = null,
}) {
  if (!recipientUserId || !type || !title || !message) {
    throw new NotificationError(400, 'Recipient, type, title, and message are required.')
  }

  const client = tx || prisma
  if (!client.notification) return null

  // Idempotency / duplicate check for entity-linked notifications
  if (relatedEntityType && relatedEntityId) {
    const existing = await client.notification.findFirst({
      where: {
        recipientUserId,
        type,
        relatedEntityType,
        relatedEntityId,
      },
    })
    if (existing) {
      return existing
    }
  }

  return client.notification.create({
    data: {
      recipientUserId,
      actorUserId,
      type,
      title: title.slice(0, 150),
      message: message.slice(0, 500),
      relatedEntityType: relatedEntityType ? relatedEntityType.slice(0, 50) : null,
      relatedEntityId: relatedEntityId ? relatedEntityId.slice(0, 191) : null,
    },
  })
}

/**
 * Notifies all accepted connected family members for a given elder.
 */
async function notifyConnectedFamily({
  elderId,
  actorUserId = null,
  type,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null,
  tx = null,
}) {
  const client = tx || prisma
  const connections = await client.familyConnection.findMany({
    where: { elderId, status: 'ACCEPTED' },
    select: { familyId: true },
  })

  if (!connections.length) return []

  const created = []
  for (const conn of connections) {
    // Avoid notifying the actor if they are the family member
    if (actorUserId && conn.familyId === actorUserId) continue

    const n = await createNotification({
      recipientUserId: conn.familyId,
      actorUserId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      tx: client,
    })
    created.push(n)
  }
  return created
}

async function getNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  const skip = (safePage - 1) * safeLimit

  const where = {
    recipientUserId: userId,
    ...(unreadOnly ? { readAt: null } : {}),
  }

  const [total, unreadCount, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientUserId: userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: { id: true, name: true, role: true },
        },
      },
    }),
  ])

  return {
    notifications: items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      relatedEntityType: item.relatedEntityType,
      relatedEntityId: item.relatedEntityId,
      read: item.readAt !== null,
      readAt: item.readAt,
      createdAt: item.createdAt,
      actor: item.actorUser
        ? { id: item.actorUser.id, name: item.actorUser.name, role: item.actorUser.role }
        : null,
    })),
    unreadCount,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  }
}

async function getUnreadCount(userId) {
  const unreadCount = await prisma.notification.count({
    where: { recipientUserId: userId, readAt: null },
  })
  return { unreadCount }
}

async function markAsRead(notificationId, userId) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
  })

  if (!notification) {
    throw new NotificationError(404, 'Notification not found.')
  }

  if (notification.readAt) {
    return {
      ...notification,
      read: true,
    }
  }

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  })

  return {
    ...updated,
    read: true,
  }
}

async function markAllAsRead(userId) {
  const result = await prisma.notification.updateMany({
    where: { recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  })

  return {
    count: result.count,
    message: 'All notifications marked as read.',
  }
}

async function deleteNotification(notificationId, userId) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, recipientUserId: userId },
  })

  if (!notification) {
    throw new NotificationError(404, 'Notification not found.')
  }

  await prisma.notification.delete({
    where: { id: notificationId },
  })

  return {
    message: 'Notification deleted successfully.',
  }
}

module.exports = {
  NotificationError,
  createNotification,
  notifyConnectedFamily,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
}
