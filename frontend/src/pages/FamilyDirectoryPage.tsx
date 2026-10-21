import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Heart, Pill, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton, PageHeader, StatusBadge } from '../components/ui'
import { familyConnectionService } from '../services/connectionService'
import type { FamilyConnectionSummary } from '../types/connections'

export type FamilyDirectoryMode = 'elders' | 'medications' | 'checkins'

export function FamilyDirectoryPage({ mode }: { mode: FamilyDirectoryMode }) {
  const [connections, setConnections] = useState<FamilyConnectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await familyConnectionService.getConnections()
      setConnections(all.filter((item) => item.status === 'ACCEPTED'))
      setError(false)
    } catch { setError(true) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const config = mode === 'elders'
    ? { title: 'Your connected elders', description: 'Your connected family members, in one place.', eyebrow: 'YOUR SUPPORT CIRCLE' }
    : mode === 'medications'
      ? { title: 'Family medications', description: 'Choose a connected elder to review their medicine schedule.', eyebrow: 'READ-ONLY CARE' }
      : { title: 'Family check-ins', description: 'Choose a connected elder to review their daily check-ins.', eyebrow: 'READ-ONLY CARE' }
  const destination = mode === 'checkins' ? 'checkins' : 'medications'

  return <div className="app-page">
    <PageHeader eyebrow={config.eyebrow} title={config.title} description={config.description} action={mode === 'elders' ? <Link className="button button-primary" to="/family/connections"><Users size={17}/> Find an elder</Link> : undefined}/>
    {error && <ErrorState title="We couldn't load your connected elders." onRetry={() => void load()}/>}
    {loading ? <div className="directory-list"><LoadingSkeleton rows={4}/></div> : error ? null : connections.length === 0 ? <section className="dashboard-panel"><EmptyState title="No elders connected yet" description="Search for an elder and send a connection request. Their information will appear here after they accept." icon={<Heart size={23}/>} action={<Link className="button button-primary" to="/family/connections">Find an elder</Link>}/></section> : <div className="directory-list">{connections.map((connection) => <article className="directory-card" key={connection.connectionId}><span className="user-avatar family-avatar">{connection.elder.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div className="directory-person"><h2>{connection.elder.name}</h2><p>{connection.relationship}</p></div><StatusBadge status="success">Connected</StatusBadge>{mode === 'elders' ? <div className="directory-actions"><Link className="button button-secondary button-small" to={`/family/elders/${encodeURIComponent(connection.elder.id)}/medications`}><Pill size={16}/> Medicines</Link><Link className="button button-primary button-small" to={`/family/elders/${encodeURIComponent(connection.elder.id)}/checkins`}>Check-ins <ArrowRight size={15}/></Link></div> : <Link className="button button-primary button-small directory-action" to={`/family/elders/${encodeURIComponent(connection.elder.id)}/${destination}`}>{mode === 'checkins' ? 'View check-ins' : 'View medicines'} <ArrowRight size={15}/></Link>}</article>)}</div>}
  </div>
}

export function UnavailablePage({ title }: { title: string }) {
  return <div className="app-page"><PageHeader eyebrow="COMING SOON" title={title} description="This feature is not available yet."/><section className="dashboard-panel"><EmptyState title={`${title} is coming soon`} description="This feature has not been implemented, so there are no actions here yet."/></section></div>
}
