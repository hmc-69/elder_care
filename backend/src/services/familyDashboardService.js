const prisma = require('../lib/prisma')
const { getToday } = require('./checkinService')
const { getFamilyMedicationView } = require('./medicationService')
const { getUnreadCount } = require('./notificationService')

async function getFamilyDashboardSummary(familyId) {
  // 1. Get all ACCEPTED connections for this family member
  const connections = await prisma.familyConnection.findMany({
    where: { familyId, status: 'ACCEPTED' },
    include: {
      elder: {
        select: { id: true, name: true, phone: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const unreadInfo = await getUnreadCount(familyId)

  if (connections.length === 0) {
    return {
      elders: [],
      checkIns: [],
      medications: [],
      activeEmergencies: [],
      recentActivity: [],
      unreadNotificationsCount: unreadInfo.unreadCount,
    }
  }

  const elderIds = connections.map((c) => c.elderId)

  // 2. Fetch active emergencies for all connected elders
  const activeEmergencies = await prisma.emergencyEvent.findMany({
    where: {
      elderId: { in: elderIds },
      status: { in: ['ACTIVE', 'ACKNOWLEDGED'] },
    },
    include: {
      elder: { select: { id: true, name: true } },
      acknowledgedBy: { select: { id: true, name: true } },
    },
    orderBy: { triggeredAt: 'desc' },
  })

  // 3. Concurrently fetch today's check-ins and medications for each elder
  const elderData = await Promise.all(
    connections.map(async (connection) => {
      const elderId = connection.elderId
      const elderName = connection.elder.name

      const [checkInResult, medicationResult] = await Promise.allSettled([
        getToday(elderId),
        getFamilyMedicationView(familyId, elderId),
      ])

      const todayCheckIns = checkInResult.status === 'fulfilled' ? checkInResult.value : []
      const medicationView = medicationResult.status === 'fulfilled' ? medicationResult.value : null
      const todayMeds = medicationView?.today || []

      const medStats = {
        total: todayMeds.length,
        taken: todayMeds.filter((m) => m.status === 'TAKEN').length,
        due: todayMeds.filter((m) => m.status === 'DUE').length,
        missed: todayMeds.filter((m) => m.status === 'MISSED').length,
        pending: todayMeds.filter((m) => m.status === 'PENDING').length,
      }

      return {
        connection: {
          id: connection.id,
          elderId: connection.elder.id,
          elderName: connection.elder.name,
          relationship: connection.relationship,
          phone: connection.elder.phone || null,
        },
        checkIns: {
          elderId,
          elderName,
          items: todayCheckIns,
          completedCount: todayCheckIns.filter((c) => c.status === 'COMPLETED').length,
        },
        medications: {
          elderId,
          elderName,
          items: todayMeds,
          stats: medStats,
        },
      }
    })
  )

  // 4. Fetch recent relevant notifications for recent activity
  const recentNotifications = await prisma.notification.findMany({
    where: { recipientUserId: familyId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      actorUser: { select: { id: true, name: true } },
    },
  })

  const recentActivity = recentNotifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    createdAt: n.createdAt,
    actorName: n.actorUser?.name || null,
  }))

  return {
    elders: elderData.map((d) => d.connection),
    checkIns: elderData.map((d) => d.checkIns),
    medications: elderData.map((d) => d.medications),
    activeEmergencies: activeEmergencies.map((e) => ({
      id: e.id,
      elderId: e.elderId,
      elderName: e.elder?.name || 'Connected elder',
      status: e.status,
      triggeredAt: e.triggeredAt,
      acknowledgedAt: e.acknowledgedAt,
      acknowledgedByName: e.acknowledgedBy?.name || null,
      notes: e.notes,
    })),
    recentActivity,
    unreadNotificationsCount: unreadInfo.unreadCount,
  }
}

module.exports = {
  getFamilyDashboardSummary,
}
