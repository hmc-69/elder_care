export type UserRole = 'ELDER' | 'FAMILY' | 'ADMIN'

export interface User {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  createdAt: string
  updatedAt: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  name: string
  email: string
  phone?: string
  password: string
  role: 'ELDER' | 'FAMILY'
}

export interface AuthResponse {
  message: string
  token: string
  user: User
}
