import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'
import { FeedbackMessages, LoadingSkeleton } from '../components/ui'
import { connectionService, familyConnectionService } from '../services/connectionService'
import type { ConnectionRecord, ConnectionStatus, ElderProfile, FamilyConnectionSummary, PersonSummary, Relationship } from '../types/connections'

const relationships: Relationship[] = ['Son', 'Daughter', 'Spouse', 'Parent', 'Sibling', 'Guardian', 'Relative', 'Caregiver', 'Other']

export function FamilyConnectionsPage() {
  const [query, setQuery] = useState('')
  const [relationshipsByElder, setRelationshipsByElder] = useState<Record<string, Relationship>>({})
  const [results, setResults] = useState<PersonSummary[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [connections, setConnections] = useState<FamilyConnectionSummary[]>([])
  const [requestStatuses, setRequestStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [elderProfile, setElderProfile] = useState<ElderProfile | null>(null)
  const [details, setDetails] = useState<ConnectionRecord | null>(null)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)

  const refreshConnections = useCallback(async () => {
    setConnections(await familyConnectionService.getConnections())
    setRequestStatuses({})
  }, [])

  useEffect(() => {
    refreshConnections()
      .catch(() => setError('Could not load your connections. Please try again.'))
      .finally(() => setLoading(false))
  }, [refreshConnections])

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setElderProfile(null)
    setHasSearched(false)
    setResults([])
    if (query.trim().length < 2) {
      setError('Enter at least two characters to search.')
      return
    }
    setSearching(true)
    try {
      setResults(await familyConnectionService.searchElders(query.trim()))
      setHasSearched(true)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Search failed. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  async function sendRequest(elderId: string, selectedRelationship: Relationship) {
    setBusyId(elderId)
    setError('')
    setMessage('')
    try {
      await familyConnectionService.requestConnection(elderId, selectedRelationship)
      setRequestStatuses((current) => ({ ...current, [elderId]: 'PENDING' }))
      setMessage('Connection request sent.')
      await refreshConnections()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send the request.')
    } finally {
      setBusyId(null)
    }
  }

  async function viewElder(connection: FamilyConnectionSummary) {
    setError('')
    setMessage('')
    try {
      const [profile, record] = await Promise.all([
        familyConnectionService.getElderProfile(connection.elder.id),
        connectionService.getDetails(connection.connectionId),
      ])
      setElderProfile(profile)
      setDetails(record)
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load the connected profile.')
    }
  }

  async function removeConnection(connectionId: string) {
    setBusyId(connectionId)
    setError('')
    setMessage('')
    try {
      await connectionService.remove(connectionId)
      setMessage('Connection removed.')
      setPendingRemove(null)
      setElderProfile(null)
      setDetails(null)
      await refreshConnections()
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not remove the connection.')
    } finally {
      setBusyId(null)
    }
  }

  function statusFor(elderId: string): ConnectionStatus | undefined {
    return connections.find((connection) => connection.elder.id === elderId)?.status ?? requestStatuses[elderId]
  }

  function renderConnections(status: ConnectionStatus, title: string) {
    const items = connections.filter((connection) => connection.status === status)
    return <section className="connections-section" aria-labelledby={`family-${status.toLowerCase()}-title`}>
      <h2 id={`family-${status.toLowerCase()}-title`}>{title} <span className="count-badge">{items.length}</span></h2>
      {items.length === 0 ? <p className="empty-state">No {title.toLowerCase()} yet.</p> : <ul className="connection-list">{items.map((connection) => <li className="connection-card" key={connection.connectionId}>
        <div className="connection-person"><strong>{connection.elder.name}</strong><span>Relationship: {connection.relationship}</span></div>
        <span className={`status-badge ${connection.status.toLowerCase()}`}>{connection.status}</span>
        {connection.status === 'ACCEPTED' && <a className="small-action" href={`/family/elders/${encodeURIComponent(connection.elder.id)}/medications`}>View medicines</a>}
        {connection.status === 'ACCEPTED' && <a className="small-action" href={`/family/elders/${encodeURIComponent(connection.elder.id)}/checkins`}>View check-ins</a>}
        {connection.status === 'ACCEPTED' && <button className="small-action" onClick={() => void viewElder(connection)}>View</button>}
        {connection.status === 'ACCEPTED' && (pendingRemove === connection.connectionId
          ? <span className="confirm-actions"><button className="small-action danger" disabled={busyId === connection.connectionId} onClick={() => void removeConnection(connection.connectionId)}>Confirm removal</button><button className="small-action" onClick={() => setPendingRemove(null)}>Cancel</button></span>
          : <button className="small-action" onClick={() => setPendingRemove(connection.connectionId)}>Remove</button>)}
      </li>)}</ul>}
    </section>
  }

  return <main className="connections-page">
    <div className="connections-content"><p className="section-kicker">FAMILY CONNECTIONS</p><h1>Family Connections</h1><p className="connections-lede">Search for an elder and send a request. A connection is created only after the elder accepts.</p>
      <FeedbackMessages message={message} error={error} onDismiss={() => { setMessage(''); setError('') }}/>
      <section className="connection-panel family-search-panel" aria-labelledby="find-elder-title"><h2 id="find-elder-title">Find an Elder</h2><form className="family-search-form" onSubmit={search}>
        <label htmlFor="elder-search">Search by name or email</label>
        <div className="search-controls"><input id="elder-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email..." minLength={2} maxLength={80} /><button className="primary-button" type="submit" disabled={searching}>{searching ? 'Searching...' : 'Search'}</button></div>
      </form></section>

      {searching && <p role="status">Searching for elders...</p>}
      {hasSearched && <section className="connections-section" aria-labelledby="search-results-title"><h2 id="search-results-title">Search Results</h2>{results.length === 0 ? <p className="empty-state">No elders found.</p> : <ul className="connection-list">{results.map((person) => {
        const status = statusFor(person.id)
        const unavailable = status === 'PENDING' || status === 'ACCEPTED' || status === 'BLOCKED'
        const selectedRelationship = relationshipsByElder[person.id] ?? 'Other'
        return <li className="connection-card" key={person.id}><div className="connection-person"><strong>{person.name}</strong><span>Elder</span></div>
          {status && <span className={`status-badge ${status.toLowerCase()}`} role="status">{status === 'PENDING' ? 'Request Pending' : status === 'ACCEPTED' ? 'Connected' : status === 'REJECTED' ? 'Rejected' : 'Blocked'}</span>}
          {!unavailable && <><label htmlFor={`relationship-${person.id}`}>Relationship to {person.name}</label><select id={`relationship-${person.id}`} value={selectedRelationship} onChange={(event) => setRelationshipsByElder((current) => ({ ...current, [person.id]: event.target.value as Relationship }))}>{relationships.map((value) => <option key={value}>{value}</option>)}</select><button className="small-action send-action" disabled={busyId === person.id} onClick={() => void sendRequest(person.id, selectedRelationship)}>{busyId === person.id ? "Sending..." : "Send Connection Request"}</button></>}
        </li>
      })}</ul>}</section>}

      {elderProfile && details && <section className="profile-card connected-profile" aria-labelledby="elder-profile-title"><div className="profile-panel-heading"><h2 id="elder-profile-title">Connected elder</h2><button className="small-action" onClick={() => { setElderProfile(null); setDetails(null) }}>Close</button></div>
        <p><strong>{elderProfile.name}</strong></p><p>Phone: {elderProfile.phone || 'Not provided'}</p><p>Relationship: {details.relationship}</p><p>Status: <span className="status-badge accepted">{details.status}</span></p>
      </section>}

      {loading ? <LoadingSkeleton rows={4}/> : <>
        {renderConnections('PENDING', 'Pending requests')}
        {renderConnections('ACCEPTED', 'Connected elders')}
        {renderConnections('REJECTED', 'Rejected requests')}
        {renderConnections('BLOCKED', 'Removed connections')}
      </>}
    </div>
  </main>
}
