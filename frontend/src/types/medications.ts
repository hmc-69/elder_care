export type MedicationFrequency = 'ONCE_DAILY' | 'TWICE_DAILY' | 'THREE_TIMES_DAILY' | 'CUSTOM'
export type MedicationStatus = 'PENDING' | 'DUE' | 'TAKEN' | 'MISSED'

export interface Medication {
  id: string
  name: string
  dosage: string
  instructions: string | null
  frequency: MedicationFrequency
  times: string[]
  startDate: string
  endDate: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface MedicationEvent {
  id: string
  medication: Medication
  scheduledDate: string
  scheduledTime: string
  status: MedicationStatus
  takenAt: string | null
}

export interface MedicationInput {
  name: string
  dosage: string
  instructions: string | null
  frequency: MedicationFrequency
  times: string[]
  startDate: string
  endDate: string | null
}

export interface MedicationLog {
  id: string
  scheduledDate: string
  scheduledTime: string
  status: MedicationStatus
  takenAt: string | null
  createdAt: string
}

export interface FamilyMedicationView {
  elder: { id: string; name: string }
  medications: Medication[]
  today: MedicationEvent[]
}
