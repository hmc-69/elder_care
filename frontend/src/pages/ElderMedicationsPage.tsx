import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { FeedbackMessages, LoadingSkeleton } from '../components/ui'
import { medicationService } from '../services/medicationService'
import type { Medication, MedicationEvent, MedicationFrequency, MedicationInput, MedicationLog } from '../types/medications'

const defaultTimes: Record<MedicationFrequency, string[]> = {
  ONCE_DAILY: ['08:00'], TWICE_DAILY: ['08:00', '20:00'],
  THREE_TIMES_DAILY: ['08:00', '14:00', '20:00'], CUSTOM: ['08:00'],
}

function localDateString() {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

function emptyDraft(): MedicationInput {
  return { name: '', dosage: '', instructions: '', frequency: 'ONCE_DAILY', times: ['08:00'], startDate: localDateString(), endDate: null }
}

function formatTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function statusLabel(status: MedicationEvent['status'] | MedicationLog['status']) {
  if (status === 'TAKEN') return '✓ Taken'
  if (status === 'DUE') return '◷ Due — ready to take'
  if (status === 'MISSED') return '! Missed'
  return '○ Waiting'
}

export function ElderMedicationsPage() {
  const [medications, setMedications] = useState<Medication[]>([])
  const [today, setToday] = useState<MedicationEvent[]>([])
  const [draft, setDraft] = useState<MedicationInput>(emptyDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeactivate, setPendingDeactivate] = useState<string | null>(null)
  const [history, setHistory] = useState<{ medication: Medication; logs: MedicationLog[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const [medicationList, events] = await Promise.all([
      medicationService.getMedications(), medicationService.getTodayMedications(),
    ])
    setMedications(medicationList)
    setToday(events)
    setError('')
  }, [])

  useEffect(() => {
    refresh().catch(() => setError('Unable to load medications. Please try again.'))
      .finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh().catch(() => setError('Unable to load medications. Please try again.'))
    }, 60_000)
    return () => window.clearInterval(interval)
  }, [refresh])

  function editMedication(medication: Medication) {
    setEditingId(medication.id)
    setDraft({
      name: medication.name, dosage: medication.dosage, instructions: medication.instructions ?? '',
      frequency: medication.frequency, times: medication.times, startDate: medication.startDate,
      endDate: medication.endDate,
    })
    setError('')
    setMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(emptyDraft())
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const input = { ...draft, name: draft.name.trim(), dosage: draft.dosage.trim(), instructions: draft.instructions?.trim() || null }
      if (editingId) {
        await medicationService.updateMedication(editingId, input)
        setMessage('Medication updated successfully.')
      } else {
        await medicationService.createMedication(input)
        setMessage('Medication added successfully.')
      }
      setEditingId(null)
      setDraft(emptyDraft())
      await refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to save this medication. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function markTaken(medicationId: string) {
    setBusyId(medicationId)
    setError('')
    setMessage('')
    try {
      await medicationService.markMedicationTaken(medicationId)
      setMessage('Medication marked as taken.')
      await refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to update this dose. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function deactivate(id: string) {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await medicationService.deactivateMedication(id)
      setMessage('Medication stopped. Its history has been kept.')
      setPendingDeactivate(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to stop this medication. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function showHistory(id: string) {
    setError('')
    try {
      setHistory(await medicationService.getMedicationLogs(id))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Unable to load medication history. Please try again.')
    }
  }

  function changeFrequency(frequency: MedicationFrequency) {
    setDraft((current) => ({ ...current, frequency, times: defaultTimes[frequency] }))
  }

  function setTime(index: number, time: string) {
    setDraft((current) => ({ ...current, times: current.times.map((value, i) => i === index ? time : value) }))
  }

  const todayDate = localDateString()
  const activeMedications = medications.filter((medication) => medication.active && (!medication.endDate || medication.endDate >= todayDate))
  const inactiveMedications = medications.filter((medication) => !medication.active || (medication.endDate !== null && medication.endDate < todayDate))
  const actionableDoseId = today.filter((event) => event.status === 'DUE')
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))[0]?.id

  function medicationForm(title: string, id: string | null) {
    return <section className="medication-panel" aria-labelledby="medication-form-title">
      <h2 id="medication-form-title">{title}</h2>
      <form className="medication-form" onSubmit={(event) => void submit(event)}>
        <label>Medicine name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={120} autoComplete="off" /></label>
        <label>Dosage<input value={draft.dosage} onChange={(event) => setDraft({ ...draft, dosage: event.target.value })} required maxLength={80} placeholder="For example, 500 mg" /></label>
        <label>Instructions <span className="medication-optional">(optional)</span><textarea value={draft.instructions ?? ''} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} maxLength={500} rows={2} placeholder="For example, take after food" /></label>
        <label>Frequency<select value={draft.frequency} onChange={(event) => changeFrequency(event.target.value as MedicationFrequency)}>
          <option value="ONCE_DAILY">Once daily</option><option value="TWICE_DAILY">Twice daily</option><option value="THREE_TIMES_DAILY">Three times daily</option><option value="CUSTOM">Custom times</option>
        </select></label>
        <fieldset className="medication-time-fields"><legend>Scheduled time{draft.times.length === 1 ? '' : 's'}</legend>
          {draft.times.map((time, index) => <label key={index} htmlFor={`dose-time-${index}`}>Time {index + 1}<input id={`dose-time-${index}`} type="time" value={time} onChange={(event) => setTime(index, event.target.value)} required /></label>)}
          {draft.frequency === 'CUSTOM' && draft.times.length < 8 && <button className="secondary-button" type="button" onClick={() => setDraft((current) => ({ ...current, times: [...current.times, '12:00'] }))}>Add another time</button>}
          {draft.frequency === 'CUSTOM' && draft.times.length > 1 && <button className="small-action" type="button" onClick={() => setDraft((current) => ({ ...current, times: current.times.slice(0, -1) }))}>Remove last time</button>}
        </fieldset>
        <div className="medication-date-fields"><label>Start date<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} required /></label>
          <label>End date <span className="medication-optional">(optional)</span><input type="date" min={draft.startDate} value={draft.endDate ?? ''} onChange={(event) => setDraft({ ...draft, endDate: event.target.value || null })} /></label></div>
        <div className="medication-form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : id ? 'Save changes' : 'Add medication'}</button>{id && <button className="secondary-button" type="button" onClick={cancelEdit}>Cancel</button>}</div>
      </form>
    </section>
  }

  return <main className="connections-page medication-page">
    <div className="medication-content"><p className="section-kicker">YOUR HEALTH ROUTINE</p><h1>Medication Management</h1><p className="connections-lede">Keep your medicines and daily schedule in one easy place.</p>
      <FeedbackMessages message={message} error={error} onDismiss={() => { setMessage(''); setError('') }}/>
      {loading ? <section className="dashboard-panel"><LoadingSkeleton rows={4}/></section> : <>
        <section className="medication-section" aria-labelledby="today-medicines-title"><div className="medication-section-heading"><div><p className="section-kicker">YOUR DAILY SCHEDULE</p><h2 id="today-medicines-title">Today's Medicines</h2></div><button className="secondary-button" onClick={() => { setError(''); setLoading(true); refresh().catch(() => setError('Unable to load medications. Please try again.')).finally(() => setLoading(false)) }}>Refresh</button></div>
          {today.length === 0 ? <p className="medication-empty">No medicines scheduled for today.</p> : <ul className="medication-list">{today.map((event) => <li className="medication-card" key={event.id}>
            <div className="medication-event-time">{formatTime(event.scheduledTime)}</div><div className="medication-event-info"><h3>{event.medication.name}</h3><p>{event.medication.dosage}</p>{event.medication.instructions && <p>{event.medication.instructions}</p>}</div>
            <span className={`medication-status ${event.status.toLowerCase()}`}>{statusLabel(event.status)}</span>{event.status === 'DUE' && event.id === actionableDoseId && <button className="primary-button medication-action" disabled={busyId === event.medication.id} onClick={() => void markTaken(event.medication.id)}>{busyId === event.medication.id ? 'Saving…' : 'Mark as Taken'}</button>}
          </li>)}</ul>}
        </section>

        {!editingId && medicationForm('Add a Medicine', null)}
        <section className="medication-section" aria-labelledby="active-medicines-title"><h2 id="active-medicines-title">Active Medicines</h2>
          {activeMedications.length === 0 ? <p className="medication-empty">No medications added yet.</p> : <ul className="medication-list">{activeMedications.map((medication) => <li className="medication-card medication-record" key={medication.id}>
            <div className="medication-event-info"><h3>{medication.name}</h3><p>{medication.dosage}</p><p>{medication.times.map(formatTime).join(' · ')} · {medication.frequency.replaceAll('_', ' ').toLowerCase()}</p><p>Starts {medication.startDate}{medication.endDate ? ` · Ends ${medication.endDate}` : ''}</p></div>
            <div className="medication-card-actions"><button className="secondary-button" onClick={() => editMedication(medication)}>Edit</button><button className="small-action" onClick={() => void showHistory(medication.id)}>History</button><button className="small-action danger" onClick={() => setPendingDeactivate(medication.id)}>Deactivate</button></div>
            {pendingDeactivate === medication.id && <div className="medication-confirm" role="alertdialog" aria-label={`Stop ${medication.name}`}><p>Are you sure you want to stop this medication? Its history will be kept.</p><button className="small-action danger" disabled={busyId === medication.id} onClick={() => void deactivate(medication.id)}>Confirm deactivation</button><button className="secondary-button" onClick={() => setPendingDeactivate(null)}>Cancel</button></div>}
          </li>)}</ul>}
        </section>
        {inactiveMedications.length > 0 && <section className="medication-section" aria-labelledby="past-medicines-title"><h2 id="past-medicines-title">Past Medicines</h2><ul className="medication-list">{inactiveMedications.map((medication) => <li className="medication-card medication-record inactive" key={medication.id}><div className="medication-event-info"><h3>{medication.name}</h3><p>{medication.dosage} · {medication.active ? 'Course ended' : 'Stopped'}</p></div><button className="small-action" onClick={() => void showHistory(medication.id)}>History</button></li>)}</ul></section>}
        {editingId && medicationForm('Edit Medicine', editingId)}
      </>}
      {history && <section className="medication-panel medication-history" aria-labelledby="medication-history-title"><div className="medication-section-heading"><h2 id="medication-history-title">{history.medication.name} history</h2><button className="small-action" onClick={() => setHistory(null)}>Close</button></div>{history.logs.length === 0 ? <p className="medication-empty">No medication history recorded yet.</p> : <ul className="medication-list">{history.logs.map((log) => <li className="medication-card" key={log.id}><div className="medication-event-time">{log.scheduledDate} · {formatTime(log.scheduledTime)}</div><span className={`medication-status ${log.status.toLowerCase()}`}>{statusLabel(log.status)}</span></li>)}</ul>}</section>}
    </div>
  </main>
}
