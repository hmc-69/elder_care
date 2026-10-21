export type CheckInStatus = 'PENDING' | 'COMPLETED' | 'MISSED'
export type CheckInPeriod = 'MORNING' | 'NIGHT'

export interface CheckIn {
  id: string
  date: string
  period: CheckInPeriod
  scheduledTime: string
  status: CheckInStatus
  isDue: boolean
  late: boolean
  checkedInAt: string | null
  createdAt?: string
  updatedAt?: string
}

export interface FamilyCheckInView {
  elder: { id: string; name: string }
  today: CheckIn[]
  history: CheckIn[]
}
