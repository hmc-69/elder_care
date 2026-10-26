import type { User } from './auth'

export type ConnectionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED'
export type Relationship = 'Son' | 'Daughter' | 'Spouse' | 'Parent' | 'Sibling' | 'Guardian' | 'Relative' | 'Caregiver' | 'Other'

export interface PersonSummary {
  id: string
  name: string
}

export interface FamilyConnectionSummary {
  connectionId: string
  elder: PersonSummary
  relationship: Relationship
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface ElderConnectionSummary {
  connectionId: string
  family: PersonSummary
  relationship: Relationship
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
}

export interface ConnectionRecord {
  id: string
  familyId: string
  elderId: string
  relationship: Relationship
  status: ConnectionStatus
  createdAt: string
  updatedAt: string
  family: PersonSummary
  elder: PersonSummary
}

export type ElderProfile = Pick<User, 'id' | 'name' | 'phone' | 'createdAt' | 'updatedAt'>
