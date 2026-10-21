import { apiRequest } from './api'
import type {
  ElderSosHistoryResponse,
  EmergencyEvent,
  FamilyElderSosView,
} from '../types/sos'

export const sosService = {
  async triggerSos(notes?: string): Promise<{ message: string; event: EmergencyEvent; disclaimer: string }> {
    return apiRequest('/sos', {
      method: 'POST',
      body: JSON.stringify({ notes: notes?.trim() || null }),
    })
  },

  async getActiveSos(): Promise<EmergencyEvent | null> {
    const result = await apiRequest<{ event: EmergencyEvent | null; disclaimer: string }>('/sos/active')
    return result.event
  },

  async getElderHistory(page = 1, limit = 10): Promise<ElderSosHistoryResponse> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    return apiRequest(`/sos/history?${params.toString()}`)
  },

  async getEventById(id: string): Promise<EmergencyEvent> {
    const result = await apiRequest<{ event: EmergencyEvent; disclaimer: string }>(`/sos/${encodeURIComponent(id)}`)
    return result.event
  },

  async cancelSos(id: string, reason?: string): Promise<{ message: string; event: EmergencyEvent }> {
    return apiRequest(`/sos/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason?.trim() || null }),
    })
  },

  async getFamilyElderSos(elderId: string, page = 1, limit = 10): Promise<FamilyElderSosView> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    return apiRequest(`/family/elders/${encodeURIComponent(elderId)}/sos?${params.toString()}`)
  },

  async getFamilyActiveEmergencies(): Promise<EmergencyEvent[]> {
    const result = await apiRequest<{ events: EmergencyEvent[]; disclaimer: string }>('/sos/family/active')
    return result.events
  },

  async acknowledgeSos(id: string): Promise<{ message: string; event: EmergencyEvent }> {
    return apiRequest(`/sos/${encodeURIComponent(id)}/acknowledge`, {
      method: 'POST',
    })
  },

  async resolveSos(id: string, notes?: string): Promise<{ message: string; event: EmergencyEvent }> {
    return apiRequest(`/sos/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ notes: notes?.trim() || null }),
    })
  },
}
