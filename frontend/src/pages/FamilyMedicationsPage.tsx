import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../services/api'
import { ErrorState, LoadingSkeleton } from '../components/ui'
import { medicationService } from '../services/medicationService'
import type { FamilyMedicationView, MedicationEvent } from '../types/medications'

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function localDateString() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function statusLabel(status: MedicationEvent['status']) {
  if (status === 'TAKEN') return '✓ Taken'
  if (status === 'DUE') return '◷ Due'
  if (status === 'MISSED') return '! Missed'
  return '○ Pending'
}

export function FamilyMedicationsPage() {
  const { elderId = '' } = useParams()
  const [view, setView] = useState<FamilyMedicationView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentMedications = view?.medications.filter((medication) => !medication.endDate || medication.endDate >= localDateString()) ?? []

  const refresh = useCallback(async () => {
    setView(await medicationService.getFamilyMedicationView(elderId))
    setError('')
  }, [elderId])

  useEffect(() => {
    setLoading(true)
    refresh().catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Unable to load medications. Please try again.'))
      .finally(() => setLoading(false))
  }, [refresh])

  function retry() {
    setLoading(true)
    void refresh().catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Unable to load medications. Please try again.')).finally(() => setLoading(false))
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh().catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Unable to load medications. Please try again.'))
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  return <main className="connections-page medication-page">
    <div className="medication-content"><p className="section-kicker">FAMILY VIEW · READ ONLY</p><h1>{view?.elder.name ? `${view.elder.name}'s Medicines` : 'Elder Medicines'}</h1><p className="connections-lede">View medicines and today's schedule for your connected elder.</p>
      {error && <ErrorState title={error} onRetry={retry}/>}
      {loading ? <section className="dashboard-panel"><LoadingSkeleton rows={4}/></section> : view && <>
        <section className="medication-section" aria-labelledby="family-today-title"><h2 id="family-today-title">Today's Medicines</h2>
          {view.today.length === 0 ? <p className="medication-empty">No medicines scheduled for today.</p> : <ul className="medication-list">{view.today.map((event) => <li className="medication-card" key={event.id}>
            <div className="medication-event-time">{formatTime(event.scheduledTime)}</div><div className="medication-event-info"><h3>{event.medication.name}</h3><p>{event.medication.dosage}</p>{event.medication.instructions && <p>{event.medication.instructions}</p>}</div><span className={`medication-status ${event.status.toLowerCase()}`}>{statusLabel(event.status)}</span>
          </li>)}</ul>}
        </section>
        <section className="medication-section" aria-labelledby="family-medication-list-title"><h2 id="family-medication-list-title">Active Medicines</h2>
          {currentMedications.length === 0 ? <p className="medication-empty">No medications added yet.</p> : <ul className="medication-list">{currentMedications.map((medication) => <li className="medication-card medication-record" key={medication.id}><div className="medication-event-info"><h3>{medication.name}</h3><p>{medication.dosage}</p>{medication.instructions && <p>{medication.instructions}</p>}<p>Scheduled: {medication.times.map(formatTime).join(' · ')}</p></div></li>)}</ul>}
        </section>
      </>}
    </div>
  </main>
}
