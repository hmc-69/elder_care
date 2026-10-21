import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, Clock, Heart, PhoneCall, ShieldAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, FeedbackMessages, LoadingSkeleton, PageHeader, StatusBadge } from '../components/ui'
import { sosService } from '../services/sosService'
import { familyConnectionService } from '../services/connectionService'
import type { EmergencyEvent } from '../types/sos'
import type { FamilyConnectionSummary } from '../types/connections'

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

export function FamilyEmergenciesPage() {
  const [activeEmergencies, setActiveEmergencies] = useState<EmergencyEvent[]>([])
  const [connections, setConnections] = useState<FamilyConnectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)

  // Resolve modal state
  const [resolvingEvent, setResolvingEvent] = useState<EmergencyEvent | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [allEmergencies, allConnections] = await Promise.all([
        sosService.getFamilyActiveEmergencies(),
        familyConnectionService.getConnections(),
      ])
      setActiveEmergencies(allEmergencies)
      setConnections(allConnections.filter((c) => c.status === 'ACCEPTED'))
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Polling every 15 seconds to catch new emergencies or cancellations
  useEffect(() => {
    const timer = setInterval(() => {
      void loadData()
    }, 15000)
    return () => clearInterval(timer)
  }, [loadData])

  async function handleAcknowledge(eventId: string) {
    setActingId(eventId)
    setActionMessage('')
    setActionError('')
    try {
      const res = await sosService.acknowledgeSos(eventId)
      setActionMessage(res.message)
      await loadData()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not acknowledge alert.')
      await loadData()
    } finally {
      setActingId(null)
    }
  }

  async function handleResolve() {
    if (!resolvingEvent) return
    setActingId(resolvingEvent.id)
    setActionMessage('')
    setActionError('')
    try {
      const res = await sosService.resolveSos(resolvingEvent.id, resolutionNotes)
      setActionMessage(res.message)
      setResolvingEvent(null)
      setResolutionNotes('')
      await loadData()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not resolve alert.')
      await loadData()
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="app-page family-emergencies-page">
      <PageHeader
        eyebrow="FAMILY SAFETY CENTER"
        title="Emergency Alerts"
        description="Monitor active SOS alerts from your connected elders and coordinate responses."
      />

      <aside className="emergency-disclaimer-banner" role="note" aria-label="Emergency disclaimer">
        <PhoneCall size={20} className="disclaimer-icon" aria-hidden="true" />
        <div>
          <strong>Important Life-Safety Notice:</strong>
          <p>
            ElderCare Connect SOS displays in-app alerts from your connected family. It does <strong>not</strong> contact 911 or dispatch emergency responders. If your loved one is in immediate physical danger, dial <strong>911</strong> directly.
          </p>
        </div>
      </aside>

      <FeedbackMessages
        message={actionMessage}
        error={actionError}
        onDismiss={() => { setActionMessage(''); setActionError('') }}
      />

      {loading ? (
        <div className="directory-list">
          <LoadingSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorState title="Unable to load emergency alerts." onRetry={() => void loadData()} />
      ) : (
        <>
          {/* Active Emergencies Section */}
          <section className="dashboard-panel active-emergencies-section" aria-labelledby="active-emergencies-heading">
            <div className="panel-heading">
              <div>
                <span className="panel-icon warm">
                  <ShieldAlert size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="panel-overline">URGENT NOTIFICATIONS</p>
                  <h2 id="active-emergencies-heading">
                    Active SOS Alerts ({activeEmergencies.length})
                  </h2>
                </div>
              </div>
            </div>

            {activeEmergencies.length === 0 ? (
              <div className="sos-all-clear">
                <Check size={28} className="all-clear-icon" aria-hidden="true" />
                <div>
                  <h3>All Clear</h3>
                  <p>No active emergency alerts from your connected elders at this time.</p>
                </div>
              </div>
            ) : (
              <div className="active-emergency-cards">
                {activeEmergencies.map((alert) => (
                  <article key={alert.id} className={`active-emergency-card status-${alert.status.toLowerCase()}`}>
                    <div className="active-emergency-header">
                      <div>
                        <span className="panel-overline">EMERGENCY ALERT</span>
                        <h3>{alert.elderName || 'Connected Elder'}</h3>
                      </div>
                      <StatusBadge status={alert.status === 'ACKNOWLEDGED' ? 'warning' : 'danger'}>
                        {alert.status}
                      </StatusBadge>
                    </div>

                    <div className="active-emergency-body">
                      <p className="active-emergency-time">
                        <Clock size={16} aria-hidden="true" />
                        Triggered at <strong>{formatDateTime(alert.triggeredAt)}</strong>
                      </p>

                      {alert.notes && (
                        <p className="active-emergency-notes">
                          <strong>Elder note:</strong> <em>"{alert.notes}"</em>
                        </p>
                      )}

                      {alert.status === 'ACKNOWLEDGED' && alert.acknowledgedBy && (
                        <p className="active-emergency-ack-note">
                          ✓ Acknowledged by <strong>{alert.acknowledgedBy.name}</strong> at {formatDateTime(alert.acknowledgedAt || '')}.
                        </p>
                      )}
                    </div>

                    <div className="active-emergency-actions">
                      {alert.status === 'ACTIVE' && (
                        <button
                          type="button"
                          className="button button-warning button-small"
                          disabled={actingId === alert.id}
                          onClick={() => void handleAcknowledge(alert.id)}
                        >
                          {actingId === alert.id ? 'Acknowledging…' : 'Acknowledge Alert'}
                        </button>
                      )}

                      <button
                        type="button"
                        className="button button-primary button-small"
                        disabled={actingId === alert.id}
                        onClick={() => { setResolvingEvent(alert); setResolutionNotes('') }}
                      >
                        Resolve Emergency
                      </button>

                      <Link
                        className="button button-secondary button-small"
                        to={`/family/elders/${encodeURIComponent(alert.elderId)}/sos`}
                      >
                        View Elder History <ArrowRight size={14} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Connected Elders Emergency History Directory */}
          <section className="dashboard-panel" aria-labelledby="elders-directory-heading">
            <div className="panel-heading">
              <div>
                <span className="panel-icon sage">
                  <Heart size={19} aria-hidden="true" />
                </span>
                <div>
                  <p className="panel-overline">SUPPORT CIRCLE</p>
                  <h2 id="elders-directory-heading">Connected Elders SOS History</h2>
                </div>
              </div>
            </div>

            {connections.length === 0 ? (
              <EmptyState
                title="No elders connected yet"
                description="Connect with family elders to monitor their emergency alerts."
                action={<Link className="button button-primary" to="/family/connections">Find an elder</Link>}
              />
            ) : (
              <div className="directory-list">
                {connections.map((conn) => (
                  <article className="directory-card" key={conn.connectionId}>
                    <span className="user-avatar family-avatar">
                      {conn.elder.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}
                    </span>
                    <div className="directory-person">
                      <h3>{conn.elder.name}</h3>
                      <p>{conn.relationship}</p>
                    </div>
                    <Link
                      className="button button-secondary button-small directory-action"
                      to={`/family/elders/${encodeURIComponent(conn.elder.id)}/sos`}
                    >
                      Emergency Record <ArrowRight size={15} />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Resolve Emergency Dialog */}
          {resolvingEvent && (
            <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="resolve-modal-title">
              <div className="modal-dialog">
                <div className="modal-header">
                  <h3 id="resolve-modal-title">Resolve Emergency for {resolvingEvent.elderName || 'Elder'}</h3>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Close dialog"
                    onClick={() => setResolvingEvent(null)}
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="modal-body">
                  <p>
                    Please confirm that the elder is safe and this emergency incident is concluded.
                  </p>
                  <label htmlFor="resolve-notes-input" className="form-label">
                    Resolution summary (optional):
                  </label>
                  <input
                    id="resolve-notes-input"
                    type="text"
                    className="text-input"
                    placeholder="e.g. Visited elder, confirmed safe and provided help"
                    maxLength={500}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                  />
                </div>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setResolvingEvent(null)}
                    disabled={actingId === resolvingEvent.id}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void handleResolve()}
                    disabled={actingId === resolvingEvent.id}
                  >
                    {actingId === resolvingEvent.id ? 'Resolving…' : 'Confirm Resolution'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
