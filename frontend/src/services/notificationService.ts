import { apiRequest } from './api'
import type {
  Notification,
  NotificationListResponse,
  UnreadCountResponse,
} from '../types/notifications'

export const notificationService = {
  async getNotifications(
    page = 1,
    limit = 20,
    unreadOnly = false,
  ): Promise<NotificationListResponse> {
    return apiRequest<NotificationListResponse>(
      `/notifications?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`,
    )
  },

  async getUnreadCount(): Promise<UnreadCountResponse> {
    return apiRequest<UnreadCountResponse>('/notifications/unread-count')
  },

  async markAsRead(id: string): Promise<{ message: string; notification: Notification }> {
    return apiRequest<{ message: string; notification: Notification }>(
      `/notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' },
    )
  },

  async markAllAsRead(): Promise<{ count: number; message: string }> {
    return apiRequest<{ count: number; message: string }>('/notifications/mark-all-read', {
      method: 'PATCH',
    })
  },

  async deleteNotification(id: string): Promise<{ message: string }> {
    return apiRequest<{ message: string }>(`/notifications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },
}
