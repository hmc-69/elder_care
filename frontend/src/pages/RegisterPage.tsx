import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { AuthShell } from './LoginPage'

export function RegisterPage() {
  const { register, user, isLoading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (isLoading) return <main className="auth-page"><p role="status">Loading your account…</p></main>
  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password'))
    if (password !== String(data.get('confirmPassword'))) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await register({
        name: String(data.get('name')).trim(),
        email: String(data.get('email')).trim(),
        phone: String(data.get('phone')).trim() || undefined,
        password,
        role: String(data.get('role')) as 'ELDER' | 'FAMILY',
      })
      navigate('/dashboard', { replace: true })
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to create your account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <AuthShell title="Create your account" description="Choose the account type that best describes you.">
    <form className="auth-form" onSubmit={submit}>
      <label>Full name<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>
      <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Phone number <span className="optional-label">(optional)</span><input name="phone" type="tel" autoComplete="tel" pattern="\+?[1-9][0-9]{6,14}" title="Use 7 to 15 digits, optionally starting with +." /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>
      <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></label>
      <fieldset className="role-fieldset"><legend>Account type</legend>
        <label className="role-option"><input type="radio" name="role" value="ELDER" defaultChecked /> Older adult</label>
        <label className="role-option"><input type="radio" name="role" value="FAMILY" /> Family member</label>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
    </form>
  </AuthShell>
}
