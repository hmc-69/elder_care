import { useEffect, useState } from 'react'
import { Pencil, ShieldCheck, UserRound } from 'lucide-react'
import { ApiError, apiRequest } from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { User } from '../types/auth'
import { FeedbackMessages, PageHeader } from '../components/ui'

export function ProfilePage() {
  const { user, refreshUser } = useAuth()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (user) void refreshUser().catch(() => setError('Could not load your profile.'))
  }, [])

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    setBusy(true)
    const data = new FormData(event.currentTarget)
    try {
      const result = await apiRequest<{ user: User; message: string }>('/users/me', { method: 'PUT', body: JSON.stringify({ name: data.get('name'), phone: data.get('phone') || null }) })
      await refreshUser()
      setNotice(result.message || 'Profile updated successfully.')
      setEditing(false)
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not update your profile.') }
    finally { setBusy(false) }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice('')
    setError('')
    const form = event.currentTarget
    const data = new FormData(form)
    if (data.get('newPassword') !== data.get('confirmNewPassword')) { setError('New passwords do not match.'); return }
    setPasswordBusy(true)
    try {
      const result = await apiRequest<{ message: string }>('/users/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') }) })
      setNotice(result.message || 'Password updated successfully.')
      form.reset()
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not change your password.') }
    finally { setPasswordBusy(false) }
  }

  if (!user) return null
  const initials = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const role = user.role === 'ELDER' ? 'Older adult' : user.role === 'FAMILY' ? 'Family member' : 'Administrator'

  return <div className="app-page profile-content">
    <PageHeader eyebrow="ACCOUNT" title="Your profile" description="Manage your personal details and account security."/>
    <FeedbackMessages message={notice} error={error} onDismiss={() => { setNotice(''); setError('') }}/>
    <section className="profile-overview"><span className="profile-avatar">{initials}</span><span><strong>{user.name}</strong><small>{user.email}</small><span className="role-badge">{role}</span></span></section>
    <section className="dashboard-panel profile-panel" aria-labelledby="profile-information-title"><div className="panel-heading"><div><span className="panel-icon sage"><UserRound size={19}/></span><div><p className="panel-overline">PERSONAL DETAILS</p><h2 id="profile-information-title">Account information</h2></div></div>{!editing && <button className="button button-secondary button-small" type="button" onClick={() => setEditing(true)}><Pencil size={16}/> Edit profile</button>}</div>
      <form className="auth-form profile-form" key={user.updatedAt} onSubmit={saveProfile}>
        <label>Full name<input name="name" defaultValue={user.name} required minLength={2} maxLength={100} readOnly={!editing}/></label>
        <label>Email address<input value={user.email} readOnly/></label>
        <label>Phone number <span className="optional-label">(optional)</span><input name="phone" type="tel" defaultValue={user.phone ?? ''} pattern="\+?[1-9][0-9]{6,14}" title="Use 7 to 15 digits, optionally starting with +." readOnly={!editing}/></label>
        {editing && <div className="profile-form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button><button className="button button-secondary" type="button" onClick={(event) => { event.currentTarget.form?.reset(); setEditing(false) }}>Cancel</button></div>}
      </form>
    </section>
    <section className="dashboard-panel profile-panel" id="change-password" aria-labelledby="change-password-title"><div className="panel-heading"><div><span className="panel-icon warm"><ShieldCheck size={19}/></span><div><p className="panel-overline">ACCOUNT SECURITY</p><h2 id="change-password-title">Change password</h2></div></div></div><form className="auth-form profile-form" onSubmit={changePassword}>
      <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required/></label>
      <label>New password<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
      <label>Confirm new password<input name="confirmNewPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72}/></label>
      <button className="button button-primary" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button>
    </form></section>
  </div>
}

