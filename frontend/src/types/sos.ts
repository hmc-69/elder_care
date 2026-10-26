export type EmergencyStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED'

export interface EmergencyEvent {
  id: string
  elderId: string
  elderName?: string | null
  status: EmergencyStatus
  triggeredAt: string
  acknowledgedAt?: string | null
  acknowledgedBy?: { id: string; name: string } | null
  resolvedAt?: string | null
  resolvedById?: string | null
  resolvedBy?: { id: string; name: string } | null
  cancelledAt?: string | null
  cancellationReason?: string | null
  notes?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface ElderSosHistoryResponse {
  events: EmergencyEvent[]
  pagination: PaginationMeta
  disclaimer: string
}

export interface FamilyElderSosView {
  elder: { id: string; name: string }
  activeEvent: EmergencyEvent | null
  history: EmergencyEvent[]
  pagination: PaginationMeta
  disclaimer: string
}
