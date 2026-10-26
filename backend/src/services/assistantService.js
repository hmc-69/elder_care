const prisma = require('../lib/prisma')
const { getAIProvider, AIProviderError } = require('./aiProvider')
const { SYSTEM_SAFETY_INSTRUCTION, MEDICAL_SAFETY_DISCLAIMER, buildAuthorizedContext } = require('./assistantSafety')

class AssistantServiceError extends Error {
  constructor(message, status = 400, details = null) {
    super(message)
    this.name = 'AssistantServiceError'
    this.status = status
    this.details = details
  }
}

// In-memory sliding rate-limit: max 30 requests per minute per user
const userRequestTimestamps = new Map()
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 30

function checkRateLimit(userId) {
  const now = Date.now()
  const timestamps = userRequestTimestamps.get(userId) || []
  const validTimestamps = timestamps.filter((time) => now - time < RATE_LIMIT_WINDOW_MS)

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new AssistantServiceError('You are sending messages too quickly. Please wait a moment before trying again.', 429)
  }

  validTimestamps.push(now)
  userRequestTimestamps.set(userId, validTimestamps)
}

function generateTitleFromMessage(message) {
  const cleaned = message.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 40) return cleaned
  return `${cleaned.slice(0, 37)}...`
}

async function getAuthorizedContextForUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, role: true },
  })

  if (!user) {
    throw new AssistantServiceError('User not found.', 404)
  }

  let medications = []
  let checkIns = []

  if (user.role === 'ELDER') {
    // Only fetch the elder's own active medications and today check-ins
    medications = await prisma.medication.findMany({
      where: { elderId: userId, active: true },
      select: {
        name: true,
        dosage: true,
        frequency: true,
        times: true,
        instructions: true,
      },
      take: 15,
    })

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    checkIns = await prisma.checkIn.findMany({
      where: {
        elderId: userId,
        checkinDate: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
      select: {
        period: true,
        status: true,
        checkedInAt: true,
      },
    })
  }

  return {
    user,
    contextText: buildAuthorizedContext({ user, medications, checkIns }),
  }
}

async function sendMessage({ userId, message, conversationId = null }) {
  checkRateLimit(userId)

  // Verify conversation ownership if ID is provided
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    })
    if (!existing) {
      throw new AssistantServiceError('Conversation not found.', 404)
    }
  }

  // Load recent message history for context
  let historyMessages = []
  if (conversationId) {
    const rawHistory = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { role: true, content: true },
    })
    historyMessages = rawHistory.reverse()
  }

  // Prepare authorized context
  const { contextText } = await getAuthorizedContextForUser(userId)
  const fullSystemInstruction = `${SYSTEM_SAFETY_INSTRUCTION}\n\n[AUTHORIZED CONTEXT]:\n${contextText}`

  const messagesToSend = [
    ...historyMessages.map((m) => ({ role: m.role, content: m.content })),
    { role: 'USER', content: message.trim() },
  ]

  // Call provider
  const provider = getAIProvider()
  let aiResponse
  try {
    aiResponse = await provider.generateCompletion({
      messages: messagesToSend,
      systemInstruction: fullSystemInstruction,
    })
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw new AssistantServiceError(error.message, error.status, error.code)
    }
    throw new AssistantServiceError('The AI assistant service encountered an unexpected error. Please try again.', 503)
  }

  if (!aiResponse || !aiResponse.content) {
    throw new AssistantServiceError('The AI assistant failed to generate a response.', 502)
  }

  // Atomic database persistence: save both user message and assistant response
  const persisted = await prisma.$transaction(async (tx) => {
    let conversation
    if (conversationId) {
      conversation = await tx.conversation.findFirst({
        where: { id: conversationId, userId },
      })
      if (!conversation) {
        throw new AssistantServiceError('Conversation not found.', 404)
      }
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
    } else {
      const title = generateTitleFromMessage(message)
      conversation = await tx.conversation.create({
        data: {
          userId,
          title,
        },
      })
    }

    const userMessage = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'USER',
        content: message.trim(),
      },
    })

    const assistantMessage = await tx.chatMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: aiResponse.content.trim(),
      },
    })

    return { conversation, userMessage, assistantMessage }
  })

  return {
    conversationId: persisted.conversation.id,
    title: persisted.conversation.title,
    message: {
      id: persisted.assistantMessage.id,
      role: persisted.assistantMessage.role,
      content: persisted.assistantMessage.content,
      createdAt: persisted.assistantMessage.createdAt,
    },
    userMessage: {
      id: persisted.userMessage.id,
      role: persisted.userMessage.role,
      content: persisted.userMessage.content,
      createdAt: persisted.userMessage.createdAt,
    },
    disclaimer: MEDICAL_SAFETY_DISCLAIMER,
  }
}

async function getConversations({ userId, page = 1, limit = 20 }) {
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20))
  const skip = (safePage - 1) * safeLimit

  const [total, items] = await Promise.all([
    prisma.conversation.count({ where: { userId } }),
    prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: safeLimit,
      include: {
        _count: {
          select: { messages: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    }),
  ])

  const conversations = items.map((c) => ({
    id: c.id,
    title: c.title,
    messageCount: c._count.messages,
    lastMessage: c.messages[0] || null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }))

  return {
    conversations,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit) || 1,
    },
  }
}

async function getConversationById({ userId, conversationId }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
  })

  if (!conversation) {
    throw new AssistantServiceError('Conversation not found.', 404)
  }

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messages: conversation.messages,
    },
    disclaimer: MEDICAL_SAFETY_DISCLAIMER,
  }
}

async function updateConversation({ userId, conversationId, title }) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  })

  if (!existing) {
    throw new AssistantServiceError('Conversation not found.', 404)
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { title: title.trim() },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  })

  return { conversation: updated }
}

async function deleteConversation({ userId, conversationId }) {
  const existing = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  })

  if (!existing) {
    throw new AssistantServiceError('Conversation not found.', 404)
  }

  await prisma.conversation.delete({
    where: { id: conversationId },
  })

  return {
    success: true,
    message: 'Conversation deleted successfully.',
  }
}

module.exports = {
  AssistantServiceError,
  sendMessage,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  MEDICAL_SAFETY_DISCLAIMER,
  _testResetRateLimits: () => userRequestTimestamps.clear(),
}
