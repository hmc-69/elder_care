import { apiRequest } from './api'
import type {
  ChatResponse,
  ConversationDetailResponse,
  ConversationListResponse,
  ConversationSummary,
} from '../types/assistant'

export const assistantService = {
  async sendMessage(message: string, conversationId?: string | null): Promise<ChatResponse> {
    return apiRequest<ChatResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversationId: conversationId || undefined,
      }),
    })
  },

  async getConversations(page = 1, limit = 20): Promise<ConversationListResponse> {
    return apiRequest<ConversationListResponse>(`/assistant/conversations?page=${page}&limit=${limit}`)
  },

  async getConversation(id: string): Promise<ConversationDetailResponse> {
    return apiRequest<ConversationDetailResponse>(`/assistant/conversations/${encodeURIComponent(id)}`)
  },

  async updateConversation(id: string, title: string): Promise<{ conversation: ConversationSummary }> {
    return apiRequest<{ conversation: ConversationSummary }>(`/assistant/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    })
  },

  async deleteConversation(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/assistant/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
