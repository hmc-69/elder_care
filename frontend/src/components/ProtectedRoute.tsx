import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <main className="auth-page"><p role="status">Loading your account…</p></main>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to="/profile" replace />
  return children
}
