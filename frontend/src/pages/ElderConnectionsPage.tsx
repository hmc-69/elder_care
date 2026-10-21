import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { FeedbackMessages, LoadingSkeleton } from '../components/ui'
import { connectionService, elderConnectionService } from '../services/connectionService'
import type { ConnectionRecord, ElderConnectionSummary, Relationship } from '../types/connections'

interface ConnectionRequest {
  id: string
  family: { id: string; name: string }
  relationship: Relationship
  status: 'PENDING'
  createdAt: string
}

export function ElderConnectionsPage() {
  const [requests, setRequests] = useState<ConnectionRequest[]>([])
  const [connections, setConnections] = useState<ElderConnectionSummary[]>([])
  const [details, setDetails] = useState<ConnectionRecord | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [nextRequests, nextConnections] = await Promise.all([
      elderConnectionService.getRequests(),
      elderConnectionService.getConnections(),
    ])
    setRequests(nextRequests)
    setConnections(nextConnections)
  }, [])

  useEffect(() => {
    refresh().catch(() => setError('Could not load your connections. Please try again.'))
      .finally(() => setLoading(false))
  }, [refresh])

  async function respond(connectionId: string, action: 'accept' | 'reject') {
    setBusyId(connectionId)
    setError('')
    setMessage('')
    try {
      await elderConnectionService.respond(connectionId, action)
      setMessage(action === 'accept' ? 'Connection accepted.' : 'Connection request rejected.')
      await refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update this request.')
    } finally {
      setBusyId(null)
    }
  }

  async function showDetails(connectionId: string) {
    setError('')
    try {
      setDetails(await connectionService.getDetails(connectionId))
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load connection details.')
    }
  }

  async function removeConnection(connectionId: string) {
    setBusyId(connectionId)
    try {
      await connectionService.remove(connectionId)
      setMessage('Connection removed.')
      setPendingRemove(null)
      setDetails(null)
      await refresh()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove the connection.')
    } finally {
      setBusyId(null)
    }
  }

  const accepted = connections.filter((connection) => connection.status === 'ACCEPTED')
  const history = connections.filter((connection) => connection.status !== 'ACCEPTED')

  return <main className="connections-page">
    <div className="connections-content elder-connections-content"><p className="section-kicker">YOUR FAMILY CONNECTIONS</p><h1>Connection requests</h1><p className="connections-lede">Review each request and choose whether to connect.</p>
      <FeedbackMessages message={message} error={error} onDismiss={() => { setMessage(''); setError('') }}/>
      {loading ? <LoadingSkeleton rows={4}/> : <>
        <section className="connections-section" aria-labelledby="pending-requests-title"><h2 id="pending-requests-title">Pending requests <span className="count-badge">{requests.length}</span></h2>
          {requests.length === 0 ? <p className="empty-state">No pending requests.</p> : <ul className="connection-list">{requests.map((request) => <li className="connection-card elder-request-card" key={request.id}>
            <div className="connection-person"><strong>{request.family.name}</strong><span>Relationship: {request.relationship}</span></div><span className="status-badge pending">PENDING</span>
            <div className="request-actions"><button className="primary-button" disabled={busyId === request.id} onClick={() => void respond(request.id, 'accept')}>Accept</button><button className="small-action danger" disabled={busyId === request.id} onClick={() => void respond(request.id, 'reject')}>Reject</button></div>
          </li>)}</ul>}
        </section>

        <section className="connections-section" aria-labelledby="connected-family-title"><h2 id="connected-family-title">Connected family members <span className="count-badge">{accepted.length}</span></h2>
          {accepted.length === 0 ? <p className="empty-state">No family members connected yet.</p> : <ul className="connection-list">{accepted.map((connection) => <li className="connection-card" key={connection.connectionId}>
            <div className="connection-person"><strong>{connection.family.name}</strong><span>Relationship: {connection.relationship}</span></div><span className="status-badge accepted">ACCEPTED</span>
            <button className="small-action" onClick={() => void showDetails(connection.connectionId)}>View</button>
            {pendingRemove === connection.connectionId
              ? <span className="confirm-actions"><button className="small-action danger" disabled={busyId === connection.connectionId} onClick={() => void removeConnection(connection.connectionId)}>Confirm removal</button><button className="small-action" onClick={() => setPendingRemove(null)}>Cancel</button></span>
              : <button className="small-action" onClick={() => setPendingRemove(connection.connectionId)}>Remove</button>}
          </li>)}</ul>}
        </section>

        <section className="connections-section" aria-labelledby="connection-history-title"><h2 id="connection-history-title">Connection history</h2>
          {history.length === 0 ? <p className="empty-state">No other connection history.</p> : <ul className="connection-list">{history.map((connection) => <li className="connection-card" key={connection.connectionId}>
            <div className="connection-person"><strong>{connection.family.name}</strong><span>Relationship: {connection.relationship}</span></div><span className={`status-badge ${connection.status.toLowerCase()}`}>{connection.status}</span><button className="small-action" onClick={() => void showDetails(connection.connectionId)}>View</button>
          </li>)}</ul>}
        </section>
      </>}

      {details && <section className="profile-card connected-profile" aria-labelledby="connection-details-title"><div className="profile-panel-heading"><h2 id="connection-details-title">Connection details</h2><button className="small-action" onClick={() => setDetails(null)}>Close</button></div><p>Family member: {details.family.name}</p><p>Relationship: {details.relationship}</p><p>Status: <span className={`status-badge ${details.status.toLowerCase()}`}>{details.status}</span></p></section>}
    </div>
  </main>
}
