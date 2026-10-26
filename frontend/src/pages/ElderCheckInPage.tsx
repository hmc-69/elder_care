import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { FeedbackMessages, LoadingSkeleton } from '../components/ui'
import { checkinService } from '../services/checkinService'
import type { CheckIn, CheckInPeriod } from '../types/checkins'

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function formatSchedule(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function statusText(checkIn: CheckIn) {
  if (checkIn.status === 'COMPLETED') return checkIn.late ? '✓ Completed late' : '✓ Completed'
  if (checkIn.status === 'MISSED') return '⚠ Missed'
  return checkIn.isDue ? '◷ Due' : '◷ Pending'
}
function periodName(period: CheckInPeriod) { return period === 'MORNING' ? 'Morning' : 'Night' }

export function ElderCheckInPage() {
  const [today, setToday] = useState<CheckIn[]>([])
  const [history, setHistory] = useState<CheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<CheckInPeriod | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [current, recent] = await Promise.all([checkinService.getTodayCheckIn(), checkinService.getCheckInHistory()])
      setToday(current)
      setHistory(recent)
      setError('')
    } catch {
      setError('Unable to load your check-in status.')
    }
  }, [])

  useEffect(() => { void refresh().finally(() => setLoading(false)) }, [refresh])
  useEffect(() => {
    const interval = window.setInterval(() => { void refresh() }, 60_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  async function complete(period: CheckInPeriod) {
    setSaving(period)
    setMessage('')
    setError('')
    try {
      const result = await checkinService.completeTodayCheckIn(period)
      setToday((items) => items.map((item) => item.period === period ? result : item))
      setMessage(`${periodName(period)} check-in saved. Your family can see that you checked in.`)
      setHistory(await checkinService.getCheckInHistory())
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setMessage(`${periodName(period)} check-in is already complete.`)
        await refresh()
      } else setError(cause instanceof ApiError ? cause.message : 'Unable to complete your check-in. Please try again.')
    } finally { setSaving(null) }
  }

  return <main className="connections-page checkin-page">
    <div className="checkin-content"><p className="section-kicker">DAILY WELLBEING</p><h1>Daily Check-in</h1>
      <FeedbackMessages message={message} error={error} onDismiss={() => { setMessage(''); setError('') }}/>
      {loading ? <section className="dashboard-panel"><LoadingSkeleton rows={2}/></section> : <section className="checkin-hero" aria-labelledby="checkin-title">
        <h2 id="checkin-title">Are you okay today?</h2>
        <div className="checkin-period-grid">{(['MORNING', 'NIGHT'] as const).map((period) => {
          const item = today.find((checkIn) => checkIn.period === period)
          if (!item) return null
          return <article className={`checkin-period-card ${item.status.toLowerCase()}`} key={period}>
            <h3>{periodName(period)} check-in</h3>
            <p className="checkin-detail">Scheduled for <strong>{formatSchedule(item.scheduledTime)}</strong></p>
            {item.status === 'COMPLETED' ? <><p className="checkin-status completed" role="status">{statusText(item)}</p><p className="checkin-detail">Checked in at <strong>{formatTime(item.checkedInAt || '')}</strong></p></> : <><p className={`checkin-status ${item.status.toLowerCase()}`} role="status">{statusText(item)}</p>{item.status === 'MISSED' && <p className="checkin-warning">This check-in was missed. You can still check in now.</p>}<button className="checkin-button" type="button" onClick={() => void complete(period)} disabled={saving !== null}>{saving === period ? 'Saving...' : item.status === 'MISSED' ? 'Check In Now' : "I'M OKAY"}</button></>}
          </article>
        })}</div>
        <p className="checkin-detail">You can check in once in the morning and once at night.</p>
      </section>}
      {!loading && <section className="checkin-history" aria-labelledby="checkin-history-title"><h2 id="checkin-history-title">Check-in History</h2>{history.length === 0 ? <p className="checkin-message">No check-in history available.</p> : <ul>{history.map((item) => <li key={item.id}><span><strong>{item.date === today[0]?.date ? `Today · ${periodName(item.period)}` : `${formatDate(item.date)} · ${periodName(item.period)}`}</strong><small>Scheduled for {formatSchedule(item.scheduledTime)}</small></span><span className={`checkin-status ${item.status.toLowerCase()}`} role="status">{statusText(item)}{item.checkedInAt && <small>{formatTime(item.checkedInAt)}</small>}</span></li>)}</ul>}</section>}
    </div>
  </main>
}
