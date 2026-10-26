import { apiRequest } from './api'
import type {
  ConnectionRecord,
  ElderConnectionSummary,
  ElderProfile,
  FamilyConnectionSummary,
  PersonSummary,
  Relationship,
} from '../types/connections'

export const familyConnectionService = {
  async searchElders(query: string): Promise<PersonSummary[]> {
    const result = await apiRequest<{ users: PersonSummary[] }>(`/family/elders/search?query=${encodeURIComponent(query)}`)
    return result.users
  },

  async requestConnection(elderId: string, relationship: Relationship): Promise<void> {
    await apiRequest('/connections', { method: 'POST', body: JSON.stringify({ elderId, relationship }) })
  },

  async getConnections(): Promise<FamilyConnectionSummary[]> {
    return apiRequest<FamilyConnectionSummary[]>('/connections/family')
  },

  async getElderProfile(elderId: string): Promise<ElderProfile> {
    const result = await apiRequest<{ elder: ElderProfile }>(`/family/elders/${encodeURIComponent(elderId)}`)
    return result.elder
  },
}

export const elderConnectionService = {
  async getRequests(): Promise<Array<{ id: string; family: PersonSummary; relationship: Relationship; status: 'PENDING'; createdAt: string }>> {
    return apiRequest('/connections/requests')
  },

  async getConnections(): Promise<ElderConnectionSummary[]> {
    return apiRequest<ElderConnectionSummary[]>('/connections/elder')
  },

  async respond(connectionId: string, action: 'accept' | 'reject'): Promise<void> {
    await apiRequest(`/connections/${encodeURIComponent(connectionId)}/${action}`, { method: 'PUT' })
  },
}

export const connectionService = {
  async getDetails(connectionId: string): Promise<ConnectionRecord> {
    const result = await apiRequest<{ connection: ConnectionRecord }>(`/connections/${encodeURIComponent(connectionId)}`)
    return result.connection
  },

  async remove(connectionId: string): Promise<void> {
    await apiRequest(`/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' })
  },
}
