import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { checkinService } from '../services/checkinService'
import { ErrorState, LoadingSkeleton } from '../components/ui'
import type { FamilyCheckInView } from '../types/checkins'

function schedule(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function time(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function label(status: string, due = false) {
  if (status === 'COMPLETED') return '✓ Checked in'
  if (status === 'MISSED') return '⚠ Check-in missed'
  return due ? '◷ Due — waiting for check-in' : '◷ Waiting for check-in'
}

export function FamilyCheckInPage() {
  const { elderId = '' } = useParams()
  const [view, setView] = useState<FamilyCheckInView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    checkinService.getElderCheckInsForFamily(elderId).then((result) => { if (active) setView(result) })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [elderId, attempt])

  return <main className="connections-page checkin-page"><div className="checkin-content">
    <p className="section-kicker">FAMILY VIEW · READ ONLY</p>{loading ? <LoadingSkeleton rows={3}/> : error || !view ? <ErrorState title="Unable to load check-in information." onRetry={() => { setError(false); setLoading(true); setAttempt((value) => value + 1) }}/> : <>
      <h1>{view.elder.name}'s Check-ins</h1><p className="checkin-readonly">Read-only check-in information for your connected elder.</p>
      <section className="checkin-hero" aria-labelledby="family-today-title"><h2 id="family-today-title">Today's Check-ins</h2>{view.today.length ? <div className="checkin-period-grid">{view.today.map((item) => <article className={`checkin-period-card ${item.status.toLowerCase()}`} key={item.id}><h3>{item.period === 'MORNING' ? 'Morning' : 'Night'}</h3><p className="checkin-family-status" role="status">{label(item.status, item.isDue)}</p>{item.status === 'COMPLETED' && item.checkedInAt ? <p className="checkin-detail">Checked in at <strong>{time(item.checkedInAt)}</strong>{item.late ? ' (late)' : ''}</p> : <p className="checkin-detail">Scheduled for <strong>{schedule(item.scheduledTime)}</strong></p>}</article>)}</div> : <p>No check-in record is available for today.</p>}</section>
      <section className="checkin-history" aria-labelledby="family-history-title"><h2 id="family-history-title">Recent History</h2>{view.history.length === 0 ? <p className="checkin-message">No check-in history available.</p> : <ul>{view.history.map((item) => <li key={item.id}><span><strong>{new Date(`${item.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</strong><small>Scheduled for {schedule(item.scheduledTime)}</small></span><span className={`checkin-status ${item.status.toLowerCase()}`} role="status">{label(item.status, item.isDue)}{item.checkedInAt && <small>{time(item.checkedInAt)}</small>}</span></li>)}</ul>}</section>
    </>}
  </div></main>
}
