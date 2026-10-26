import { apiRequest, clearStoredToken, storeToken } from './api'
import type { AuthResponse, LoginInput, RegisterInput, User } from '../types/auth'

export const authService = {
  async login(input: LoginInput): Promise<User> {
    const result = await apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      authenticated: false,
    })
    storeToken(result.token)
    return result.user
  },

  async register(input: RegisterInput): Promise<User> {
    await apiRequest<{ message: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      authenticated: false,
    })
    return this.login({ email: input.email, password: input.password })
  },

  async getCurrentUser(): Promise<User> {
    const result = await apiRequest<{ user: User }>('/auth/me')
    return result.user
  },

  async logout(): Promise<void> {
    try {
      await apiRequest<{ message: string }>('/auth/logout', { method: 'POST' })
    } finally {
      clearStoredToken()
    }
  },
}
