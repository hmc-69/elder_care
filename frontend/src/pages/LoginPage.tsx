import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { login, user, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (isLoading) return <main className="auth-page"><p role="status">Loading your account…</p></main>
  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      await login({ email: String(data.get('email')), password: String(data.get('password')) })
      navigate(location.state?.from ?? '/dashboard', { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to connect. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Welcome back" description="Sign in to your ElderCare Connect account.">
    <form className="auth-form" onSubmit={submit}>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="auth-switch">New to ElderCare Connect? <Link to="/register">Create an account</Link></p>
    </form>
  </AuthShell>
}

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="auth-page"><section className="auth-card" aria-labelledby="auth-title">
    <Link className="auth-brand" to="/">ElderCare <strong>Connect</strong></Link>
    <h1 id="auth-title">{title}</h1><p className="auth-description">{description}</p>{children}
  </section></main>
}
