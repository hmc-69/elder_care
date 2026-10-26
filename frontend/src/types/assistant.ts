export type ChatRole = 'USER' | 'ASSISTANT'

export interface ChatMessage {
  id: string
  conversationId?: string
  role: ChatRole
  content: string
  createdAt: string
}

export interface ConversationSummary {
  id: string
  title: string
  messageCount: number
  lastMessage?: {
    content: string
    role: ChatRole
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

export interface ConversationDetail {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

export interface ChatResponse {
  conversationId: string
  title: string
  message: ChatMessage
  userMessage: ChatMessage
  disclaimer: string
}

export interface ConversationListResponse {
  conversations: ConversationSummary[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface ConversationDetailResponse {
  conversation: ConversationDetail
  disclaimer: string
}
