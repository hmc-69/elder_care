import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, Clock, PhoneCall, ShieldAlert, X } from 'lucide-react'
import { FeedbackMessages, LoadingSkeleton, PageHeader, StatusBadge } from '../components/ui'
import { sosService } from '../services/sosService'
import { ApiError } from '../services/api'
import type { EmergencyEvent } from '../types/sos'

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatTimeOnly(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function ElderSosPage() {
  const [activeAlert, setActiveAlert] = useState<EmergencyEvent | null>(null)
  const [history, setHistory] = useState<EmergencyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Confirmation modals
  const [showTriggerConfirm, setShowTriggerConfirm] = useState(false)
  const [sosNotes, setSosNotes] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [active, hist] = await Promise.all([
        sosService.getActiveSos(),
        sosService.getElderHistory(1, 20),
      ])
      setActiveAlert(active)
      setHistory(hist.events)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load emergency alert status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Polling every 12 seconds when there's an active alert to catch family acknowledgement/resolution
  useEffect(() => {
    const timer = setInterval(() => {
      void loadData()
    }, 12000)
    return () => clearInterval(timer)
  }, [loadData])

  async function handleTriggerSos() {
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const res = await sosService.triggerSos(sosNotes)
      setActiveAlert(res.event)
      setMessage('Emergency alert activated. Your connected family has been alerted.')
      setShowTriggerConfirm(false)
      setSosNotes('')
      await loadData()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('An emergency alert is already active for your account.')
        await loadData()
      } else {
        setError(err instanceof Error ? err.message : 'Failed to trigger emergency alert. Please call local emergency services directly.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancelSos() {
    if (!activeAlert) return
    setCancelling(true)
    setError('')
    setMessage('')
    try {
      const res = await sosService.cancelSos(activeAlert.id, cancelReason)
      setMessage(res.message || 'Emergency alert cancelled.')
      setActiveAlert(null)
      setShowCancelConfirm(false)
      setCancelReason('')
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel alert.')
      await loadData()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="app-page sos-page">
      <PageHeader
        eyebrow="EMERGENCY ASSISTANCE"
        title="SOS Emergency System"
        description="Quickly alert your connected family when you need immediate help."
      />

      {/* Primary Local Emergency Services Disclaimer */}
      <aside className="emergency-disclaimer-banner" role="note" aria-label="Emergency disclaimer">
        <PhoneCall size={20} className="disclaimer-icon" aria-hidden="true" />
        <div>
          <strong>Need immediate life-saving medical, police, or fire assistance?</strong>
          <p>
            ElderCare Connect SOS alerts your connected family members inside the app. It does <strong>not</strong> contact 911 or emergency dispatchers. If you are in immediate danger, please dial <strong>911</strong> (or your local emergency services) directly.
          </p>
        </div>
      </aside>

      <FeedbackMessages message={message} error={error} onDismiss={() => { setMessage(''); setError('') }} />

      {loading ? (
        <section className="dashboard-panel">
          <LoadingSkeleton rows={4} />
        </section>
      ) : (
        <>
          {/* Active Alert State */}
          {activeAlert ? (
            <section className="sos-active-card" aria-labelledby="active-alert-title">
              <div className="sos-active-header">
                <div className="sos-pulsing-badge" aria-hidden="true" />
                <div>
                  <span className="panel-overline">URGENT ALERT IN PROGRESS</span>
                  <h2 id="active-alert-title">
                    {activeAlert.status === 'ACKNOWLEDGED' ? 'Emergency Acknowledged by Family' : 'Emergency Alert Active'}
                  </h2>
                </div>
                <StatusBadge status={activeAlert.status === 'ACKNOWLEDGED' ? 'warning' : 'danger'}>
                  {activeAlert.status}
                </StatusBadge>
              </div>

              <div className="sos-active-details">
                <div className="sos-detail-row">
                  <Clock size={18} aria-hidden="true" />
                  <span>
                    Triggered at <strong>{formatDateTime(activeAlert.triggeredAt)}</strong>
                  </span>
                </div>

                {activeAlert.notes && (
                  <div className="sos-detail-row">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>Note: <em>"{activeAlert.notes}"</em></span>
                  </div>
                )}

                {activeAlert.status === 'ACKNOWLEDGED' && activeAlert.acknowledgedBy ? (
                  <div className="sos-acknowledged-callout" role="status">
                    <Check size={20} aria-hidden="true" />
                    <div>
                      <strong>{activeAlert.acknowledgedBy.name} acknowledged this alert at {formatTimeOnly(activeAlert.acknowledgedAt || '')}.</strong>
                      <p>Your family is responding to your emergency alert.</p>
                    </div>
                  </div>
                ) : (
                  <p className="sos-waiting-note">
                    Your connected family members have been alerted in the app. Keep your phone nearby.
                  </p>
                )}
              </div>

              {/* Only ACTIVE alerts can be cancelled by the elder */}
              {activeAlert.status === 'ACTIVE' && (
                <div className="sos-active-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    Cancel Alert (Accidental / False Alarm)
                  </button>
                </div>
              )}
            </section>
          ) : (
            /* Idle Trigger State */
            <section className="sos-trigger-panel" aria-labelledby="sos-trigger-title">
              <div className="sos-trigger-inner">
                <h2 id="sos-trigger-title">Send SOS Emergency Alert</h2>
                <p className="sos-trigger-subtitle">
                  Pressing this button sends an immediate high-priority alert to all family members connected to your account.
                </p>

                <button
                  type="button"
                  className="sos-big-button"
                  aria-label="Send SOS emergency alert to family"
                  onClick={() => setShowTriggerConfirm(true)}
                  disabled={submitting}
                >
                  <ShieldAlert size={36} aria-hidden="true" />
                  <span className="sos-button-label">SOS</span>
                  <span className="sos-button-hint">PRESS FOR EMERGENCY</span>
                </button>

                <p className="sos-safety-note">
                  A confirmation prompt will appear before the alert is broadcast.
                </p>
              </div>
            </section>
          )}

          {/* Trigger Confirmation Dialog / Modal */}
          {showTriggerConfirm && (
            <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-trigger-title">
              <div className="modal-dialog sos-modal">
                <div className="modal-header">
                  <div className="modal-icon danger">
                    <AlertTriangle size={24} aria-hidden="true" />
                  </div>
                  <h3 id="confirm-trigger-title">Confirm Emergency Alert</h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close dialog"
                    onClick={() => { setShowTriggerConfirm(false); setSosNotes('') }}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Are you sure you want to trigger an emergency alert? All connected family members will be notified immediately.
                  </p>
                  <label htmlFor="sos-notes-input" className="form-label">
                    Optional details (e.g. "I fell in the kitchen"):
                  </label>
                  <input
                    id="sos-notes-input"
                    type="text"
                    className="text-input"
                    placeholder="Brief description (optional)"
                    maxLength={500}
                    value={sosNotes}
                    onChange={(e) => setSosNotes(e.target.value)}
                  />
                  <p className="modal-disclaimer">
                    Reminder: For urgent medical dispatch, please call 911 directly.
                  </p>
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => { setShowTriggerConfirm(false); setSosNotes('') }}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void handleTriggerSos()}
                    disabled={submitting}
                  >
                    {submitting ? 'Activating SOS...' : 'Yes, Send SOS Alert'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Confirmation Dialog */}
          {showCancelConfirm && (
            <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="confirm-cancel-title">
              <div className="modal-dialog">
                <div className="modal-header">
                  <h3 id="confirm-cancel-title">Cancel Emergency Alert?</h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close dialog"
                    onClick={() => { setShowCancelConfirm(false); setCancelReason('') }}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Are you sure you want to cancel this emergency alert? This tells your family that the situation is resolved or was triggered by accident.
                  </p>
                  <label htmlFor="cancel-reason-input" className="form-label">
                    Reason for cancellation (optional):
                  </label>
                  <input
                    id="cancel-reason-input"
                    type="text"
                    className="text-input"
                    placeholder="e.g. Accidental click, false alarm"
                    maxLength={500}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => { setShowCancelConfirm(false); setCancelReason('') }}
                    disabled={cancelling}
                  >
                    Keep Alert Active
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void handleCancelSos()}
                    disabled={cancelling}
                  >
                    {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency History */}
          <section className="dashboard-panel sos-history-panel" aria-labelledby="sos-history-title">
            <div className="panel-heading">
              <div>
                <span className="panel-icon warm">
                  <Clock size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="panel-overline">PAST INCIDENTS</p>
                  <h2 id="sos-history-title">Emergency History</h2>
                </div>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="sos-history-empty">No past emergency alerts recorded.</p>
            ) : (
              <ul className="sos-history-list">
                {history.map((event) => (
                  <li key={event.id} className={`sos-history-item status-${event.status.toLowerCase()}`}>
                    <div className="sos-history-meta">
                      <strong>{formatDateTime(event.triggeredAt)}</strong>
                      <StatusBadge
                        status={
                          event.status === 'RESOLVED'
                            ? 'success'
                            : event.status === 'CANCELLED'
                              ? 'neutral'
                              : event.status === 'ACKNOWLEDGED'
                                ? 'warning'
                                : 'danger'
                        }
                      >
                        {event.status}
                      </StatusBadge>
                    </div>

                    <div className="sos-history-details">
                      {event.notes && <p className="sos-history-notes"><strong>Notes:</strong> {event.notes}</p>}
                      {event.status === 'CANCELLED' && event.cancellationReason && (
                        <p className="sos-history-reason">Reason: {event.cancellationReason}</p>
                      )}
                      {event.status === 'RESOLVED' && (
                        <p className="sos-history-resolved">
                          Resolved {event.resolvedAt ? `at ${formatDateTime(event.resolvedAt)}` : ''}
                          {event.resolvedBy ? ` by ${event.resolvedBy.name}` : ''}
                        </p>
                      )}
                      {event.status === 'ACKNOWLEDGED' && (
                        <p className="sos-history-ack">
                          Acknowledged {event.acknowledgedAt ? `at ${formatDateTime(event.acknowledgedAt)}` : ''}
                          {event.acknowledgedBy ? ` by ${event.acknowledgedBy.name}` : ''}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
