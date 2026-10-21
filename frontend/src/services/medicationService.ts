import { apiRequest } from './api'
import type { FamilyMedicationView, Medication, MedicationEvent, MedicationInput, MedicationLog } from '../types/medications'

export const medicationService = {
  async createMedication(input: MedicationInput): Promise<Medication> {
    const result = await apiRequest<{ medication: Medication }>('/medications', { method: 'POST', body: JSON.stringify(input) })
    return result.medication
  },

  async getMedications(): Promise<Medication[]> {
    const result = await apiRequest<{ medications: Medication[] }>('/medications')
    return result.medications
  },

  async getTodayMedications(): Promise<MedicationEvent[]> {
    const result = await apiRequest<{ medications: MedicationEvent[] }>('/medications/today')
    return result.medications
  },

  async getMedication(id: string): Promise<Medication> {
    const result = await apiRequest<{ medication: Medication }>(`/medications/${encodeURIComponent(id)}`)
    return result.medication
  },

  async updateMedication(id: string, input: Partial<MedicationInput>): Promise<Medication> {
    const result = await apiRequest<{ medication: Medication }>(`/medications/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) })
    return result.medication
  },

  async deactivateMedication(id: string): Promise<void> {
    await apiRequest(`/medications/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },

  async markMedicationTaken(id: string): Promise<MedicationEvent> {
    const result = await apiRequest<{ event: MedicationEvent }>(`/medications/${encodeURIComponent(id)}/taken`, { method: 'POST' })
    return result.event
  },

  async getMedicationLogs(id: string): Promise<{ medication: Medication; logs: MedicationLog[] }> {
    return apiRequest(`/medications/${encodeURIComponent(id)}/logs`)
  },

  async getFamilyMedicationView(elderId: string): Promise<FamilyMedicationView> {
    return apiRequest(`/family/elders/${encodeURIComponent(elderId)}/medications`)
  },
}
