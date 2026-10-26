import { apiRequest } from './api'
import type { CheckIn, CheckInPeriod, FamilyCheckInView } from '../types/checkins'

export const checkinService = {
  async getTodayCheckIn(): Promise<CheckIn[]> {
    const result = await apiRequest<{ checkIns: CheckIn[] }>('/checkins/today')
    return result.checkIns
  },
  async completeTodayCheckIn(period: CheckInPeriod): Promise<CheckIn> {
    const result = await apiRequest<{ checkIn: CheckIn }>('/checkins/today', { method: 'POST', body: JSON.stringify({ period }) })
    return result.checkIn
  },
  async getCheckInHistory(range: { from?: string; to?: string } = {}): Promise<CheckIn[]> {
    const query = new URLSearchParams()
    if (range.from) query.set('from', range.from)
    if (range.to) query.set('to', range.to)
    const suffix = query.size ? `?${query.toString()}` : ''
    const result = await apiRequest<{ history: CheckIn[] }>(`/checkins/history${suffix}`)
    return result.history
  },
  async getCheckIn(id: string): Promise<CheckIn> {
    const result = await apiRequest<{ checkIn: CheckIn }>(`/checkins/${encodeURIComponent(id)}`)
    return result.checkIn
  },
  async getElderCheckInsForFamily(elderId: string): Promise<FamilyCheckInView> {
    return apiRequest(`/family/elders/${encodeURIComponent(elderId)}/checkins`)
  },
}
