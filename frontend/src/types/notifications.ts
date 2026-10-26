export type NotificationType =
  | 'CONNECTION_REQUEST'
  | 'CONNECTION_ACCEPTED'
  | 'CONNECTION_REJECTED'
  | 'CHECKIN_COMPLETED'
  | 'CHECKIN_MISSED'
  | 'MEDICATION_DUE'
  | 'MEDICATION_TAKEN'
  | 'MEDICATION_MISSED'
  | 'SOS_TRIGGERED'
  | 'SOS_ACKNOWLEDGED'
  | 'SOS_RESOLVED'
  | 'SOS_CANCELLED'
  | 'SYSTEM'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  relatedEntityType: string | null
  relatedEntityId: string | null
  read: boolean
  readAt: string | null
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

export interface NotificationListResponse {
  notifications: Notification[]
  unreadCount: number
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export interface UnreadCountResponse {
  unreadCount: number
}
