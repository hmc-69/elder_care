import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { clearStoredToken, getStoredToken } from '../services/api'
import { authService } from '../services/authService'
import type { LoginInput, RegisterInput, User } from '../types/auth'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (input: LoginInput) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!getStoredToken()) {
      setIsLoading(false)
      return
    }
    authService.getCurrentUser()
      .then(setUser)
      .catch(() => clearStoredToken())
      .finally(() => setIsLoading(false))
  }, [])

  async function login(input: LoginInput) {
    setUser(await authService.login(input))
  }

  async function register(input: RegisterInput) {
    setUser(await authService.register(input))
  }

  async function logout() {
    try {
      await authService.logout()
    } catch {
      clearStoredToken()
    } finally {
      setUser(null)
    }
  }

  async function refreshUser() {
    setUser(await authService.getCurrentUser())
  }

  const value = useMemo(() => ({
    user,
    isAuthenticated: user !== null,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
  }), [user, isLoading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
