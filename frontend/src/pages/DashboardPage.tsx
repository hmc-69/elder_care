import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowRight, Check, Heart, Pill, Shield, ShieldAlert, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ErrorState, EmptyState, LoadingSkeleton, PageHeader, StatusBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { checkinService } from '../services/checkinService'
import { elderConnectionService, familyConnectionService } from '../services/connectionService'
import { medicationService } from '../services/medicationService'
import { sosService } from '../services/sosService'
import type { CheckIn, CheckInPeriod, FamilyCheckInView } from '../types/checkins'
import type { ElderConnectionSummary, FamilyConnectionSummary } from '../types/connections'
import type { FamilyMedicationView, MedicationEvent } from '../types/medications'
import type { EmergencyEvent } from '../types/sos'

function greeting(name: string) {
  const hour = new Date().getHours()
  const greetingText = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${greetingText}, ${name.split(' ')[0]}`
}
function clock(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function scheduled(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
function checkInLabel(item: CheckIn) {
  if (item.status === 'COMPLETED') return item.late ? 'Completed late' : 'Checked in'
  if (item.status === 'MISSED') return 'Missed'
  return item.isDue ? 'Due' : 'Upcoming'
}
function checkInTone(item: CheckIn): 'success' | 'pending' | 'warning' {
  return item.status === 'COMPLETED' ? 'success' : item.status === 'MISSED' ? 'warning' : 'pending'
}

export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null
  if (user.role === 'ELDER') return <ElderDashboard name={user.name}/>
  if (user.role === 'FAMILY') return <FamilyDashboard name={user.name}/>
  return <AdminDashboard name={user.name}/>
}

function ElderDashboard({ name }: { name: string }) {
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [medicines, setMedicines] = useState<MedicationEvent[]>([])
  const [connections, setConnections] = useState<ElderConnectionSummary[]>([])
  const [activeSos, setActiveSos] = useState<EmergencyEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState<CheckInPeriod | null>(null)
  const [feedback, setFeedback] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [checkInResult, medicineResult, connectionResult, sosResult] = await Promise.allSettled([
      checkinService.getTodayCheckIn(),
      medicationService.getTodayMedications(),
      elderConnectionService.getConnections(),
      sosService.getActiveSos(),
    ])
    const failures: string[] = []
    if (checkInResult.status === 'fulfilled') setCheckIns(checkInResult.value); else failures.push('check-in status')
    if (medicineResult.status === 'fulfilled') setMedicines(medicineResult.value); else failures.push("today's medicines")
    if (connectionResult.status === 'fulfilled') setConnections(connectionResult.value.filter((item) => item.status === 'ACCEPTED')); else failures.push('connections')
    if (sosResult.status === 'fulfilled') setActiveSos(sosResult.value)
    setErrors(failures)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function markOkay(period: CheckInPeriod) {
    setSaving(period)
    setFeedback('')
    try {
      const updated = await checkinService.completeTodayCheckIn(period)
      setCheckIns((items) => items.map((item) => item.period === period ? updated : item))
      setFeedback(`${period === 'MORNING' ? 'Morning' : 'Night'} check-in saved.`)
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Could not save your check-in.')
      await load()
    } finally { setSaving(null) }
  }

  return <div className="dashboard-page">
    <PageHeader eyebrow={new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} title={greeting(name)} description="Here is your care overview for today."/>
    {activeSos && (
      <div className="dashboard-sos-banner" role="alert">
        <div className="sos-banner-content">
          <ShieldAlert size={24} className="sos-banner-icon" aria-hidden="true" />
          <div>
            <strong>Emergency Alert Active ({activeSos.status})</strong>
            <p>
              Triggered at {clock(activeSos.triggeredAt)}.
              {activeSos.status === 'ACKNOWLEDGED' && activeSos.acknowledgedBy
                ? ` Acknowledged by ${activeSos.acknowledgedBy.name}.`
                : ' Your connected family has been alerted.'}
            </p>
          </div>
        </div>
        <Link className="button button-danger button-small" to="/elder/sos">
          Manage SOS <ArrowRight size={14} />
        </Link>
      </div>
    )}
    {feedback && <p className="dashboard-feedback" role="status">{feedback}</p>}
    {errors.length > 0 && <ErrorState title={`Some dashboard information could not be loaded: ${errors.join(', ')}.`} onRetry={() => void load()}/>}
    {loading ? <div className="dashboard-grid"><section className="dashboard-panel"><LoadingSkeleton rows={2}/></section><section className="dashboard-panel"><LoadingSkeleton rows={3}/></section></div> : <>
      <div className="dashboard-grid">
        <section className="dashboard-panel checkin-dashboard-panel" aria-labelledby="dashboard-checkin-title"><div className="panel-heading"><div><span className="panel-icon warm"><Heart size={19}/></span><div><p className="panel-overline">WELLBEING</p><h2 id="dashboard-checkin-title">Today's check-in</h2></div></div><Link className="text-link" to="/elder/check-in">View history <ArrowRight size={16}/></Link></div>
          {checkIns.length === 0 ? <EmptyState title="Check-in status unavailable" description="Try again to load today's check-ins."/> : <div className="dashboard-checkin-list">{checkIns.map((item) => <div className="dashboard-checkin-row" key={item.id}><div><strong>{item.period === 'MORNING' ? 'Morning' : 'Night'}</strong><small>Scheduled {scheduled(item.scheduledTime)}</small>{item.status === 'COMPLETED' && item.checkedInAt && <small>Checked in {clock(item.checkedInAt)}</small>}</div><div className="checkin-row-action"><StatusBadge status={checkInTone(item)}>{checkInLabel(item)}</StatusBadge>{item.status !== 'COMPLETED' && <button className="button button-primary button-small" disabled={saving !== null} onClick={() => void markOkay(item.period)}>{saving === item.period ? 'Saving…' : item.status === 'MISSED' ? 'Check in now' : "I'm okay"}</button>}</div></div>)}</div>}
        </section>
        <section className="dashboard-panel" aria-labelledby="dashboard-meds-title"><div className="panel-heading"><div><span className="panel-icon sage"><Pill size={19}/></span><div><p className="panel-overline">DAILY ROUTINE</p><h2 id="dashboard-meds-title">Today's medicines</h2></div></div><Link className="text-link" to="/elder/medications">View all <ArrowRight size={16}/></Link></div>
          {medicines.length === 0 ? <EmptyState title={errors.includes("today's medicines") ? 'Medicine schedule unavailable' : 'No medicines scheduled today'} description={errors.includes("today's medicines") ? 'Try again to load your medicine schedule.' : 'Your daily medicine schedule will appear here.'} icon={<Pill size={22}/>}/> : <ul className="dashboard-medication-list">{medicines.map((event) => <li key={event.id}><span className="med-time">{scheduled(event.scheduledTime)}</span><span className="med-info"><strong>{event.medication.name}</strong><small>{event.medication.dosage}</small></span><StatusBadge status={event.status === 'TAKEN' ? 'success' : event.status === 'MISSED' ? 'warning' : event.status === 'DUE' ? 'pending' : 'neutral'}>{event.status === 'TAKEN' ? 'Taken' : event.status === 'MISSED' ? 'Missed' : event.status === 'DUE' ? 'Due' : 'Upcoming'}</StatusBadge></li>)}</ul>}
        </section>
      </div>
      <section className="dashboard-panel dashboard-connections" aria-labelledby="dashboard-family-title"><div className="panel-heading"><div><span className="panel-icon sage"><Users size={19}/></span><div><p className="panel-overline">YOUR SUPPORT CIRCLE</p><h2 id="dashboard-family-title">Connected family</h2></div></div><Link className="text-link" to="/elder/connections">View connections <ArrowRight size={16}/></Link></div>
        {connections.length === 0 ? <EmptyState title="No family connections yet" description="When you connect with family, they will appear here." action={<Link className="button button-secondary button-small" to="/elder/connections">View requests</Link>}/> : <ul className="dashboard-people-list">{connections.map((connection) => <li key={connection.connectionId}><span className="user-avatar muted-avatar">{connection.family.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{connection.family.name}</strong><small>{connection.relationship}</small></span><StatusBadge status="success">Connected</StatusBadge></li>)}</ul>}
      </section>
      <div className="quick-actions">
        <Link to="/elder/assistant" className="assistant-quick-action"><Sparkles size={18}/> AI assistant <ArrowRight size={15}/></Link>
        <Link to="/elder/sos" className="sos-quick-action"><ShieldAlert size={18}/> SOS emergency <ArrowRight size={15}/></Link>
        <Link to="/elder/medications"><Pill size={18}/> Medicines <ArrowRight size={15}/></Link>
        <Link to="/elder/check-in"><Check size={18}/> Daily check-in <ArrowRight size={15}/></Link>
        <Link to="/elder/connections"><Users size={18}/> Connections <ArrowRight size={15}/></Link>
      </div>
    </>}
  </div>
}

interface FamilyMemberOverview {
  connection: FamilyConnectionSummary
  checkIns?: FamilyCheckInView
  medications?: FamilyMedicationView
  failed: boolean
}

function FamilyDashboard({ name }: { name: string }) {
  const [members, setMembers] = useState<FamilyMemberOverview[]>([])
  const [activeEmergencies, setActiveEmergencies] = useState<EmergencyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      familyConnectionService.getConnections(),
      sosService.getFamilyActiveEmergencies(),
    ]).then(async ([all, emergencies]) => {
      const accepted = all.filter((item) => item.status === 'ACCEPTED')
      const overview = await Promise.all(accepted.map(async (connection) => {
        const [checkInResult, medicationResult] = await Promise.allSettled([
          checkinService.getElderCheckInsForFamily(connection.elder.id), medicationService.getFamilyMedicationView(connection.elder.id),
        ])
        return { connection, checkIns: checkInResult.status === 'fulfilled' ? checkInResult.value : undefined, medications: medicationResult.status === 'fulfilled' ? medicationResult.value : undefined, failed: checkInResult.status === 'rejected' || medicationResult.status === 'rejected' }
      }))
      if (active) {
        setMembers(overview)
        setActiveEmergencies(emergencies)
        setError(false)
      }
    }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reload])

  const activities = useMemo(() => {
    const rows: Array<{ elder: string; text: string; time: string; kind: 'checkin' | 'medicine' | 'emergency' }> = []
    for (const emergency of activeEmergencies) {
      rows.push({
        elder: emergency.elderName || 'Connected elder',
        text: `triggered SOS Emergency (${emergency.status})`,
        time: emergency.triggeredAt,
        kind: 'emergency',
      })
    }
    for (const member of members) {
      for (const item of member.checkIns?.today ?? []) if (item.status === 'COMPLETED' && item.checkedInAt) rows.push({ elder: member.connection.elder.name, text: `${item.period === 'MORNING' ? 'Morning' : 'Night'} check-in completed`, time: item.checkedInAt, kind: 'checkin' })
      for (const item of member.medications?.today ?? []) if (item.status === 'TAKEN' && item.takenAt) rows.push({ elder: member.connection.elder.name, text: `${item.medication.name} marked taken`, time: item.takenAt, kind: 'medicine' })
    }
    return rows.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 6)
  }, [members, activeEmergencies])

  return <div className="dashboard-page">
    <PageHeader eyebrow={new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} title={greeting(name)} description="Stay close to the people who matter."/>
    {activeEmergencies.length > 0 && (
      <div className="dashboard-sos-banner family-emergency-banner" role="alert">
        <div className="sos-banner-content">
          <ShieldAlert size={24} className="sos-banner-icon danger" aria-hidden="true" />
          <div>
            <strong>URGENT: {activeEmergencies.length} Active SOS Alert{activeEmergencies.length > 1 ? 's' : ''}!</strong>
            <p>
              {activeEmergencies.map((e) => `${e.elderName || 'Elder'} (${e.status})`).join(', ')}
            </p>
          </div>
        </div>
        <Link className="button button-danger button-small" to="/family/emergencies">
          Respond Now <ArrowRight size={14} />
        </Link>
      </div>
    )}
    {error && <ErrorState title="We couldn't load your connected elders." onRetry={() => setReload((value) => value + 1)}/>}
    {loading ? <div className="dashboard-grid">{[0, 1].map((key) => <section className="dashboard-panel" key={key}><LoadingSkeleton rows={3}/></section>)}</div> : error ? null : members.length === 0 ? <section className="dashboard-panel"><EmptyState title="No elders connected yet" description="Connect with an elderly family member to see their check-ins and care information." icon={<Heart size={23}/>} action={<Link className="button button-primary" to="/family/connections">Find an elder</Link>}/></section> : <>
      <div className="dashboard-family-grid">{members.map((member) => {
        const current = member.checkIns?.today ?? []
        const completed = current.filter((item) => item.status === 'COMPLETED')
        const todayMeds = member.medications?.today ?? []
        const taken = todayMeds.filter((item) => item.status === 'TAKEN').length
        return <article className="family-elder-card" key={member.connection.connectionId}><div className="family-card-top"><span className="user-avatar family-avatar">{member.connection.elder.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><div><p className="panel-overline">{member.connection.relationship}</p><h2>{member.connection.elder.name}</h2></div><span className="connection-dot" title="Connected"/></div>
          <div className="family-card-stats"><div><span className="mini-stat-icon"><Heart size={16}/></span><span><strong>{member.failed && !member.checkIns ? 'Unavailable' : `${completed.length} / 2`}</strong><small>check-ins today</small></span></div><div><span className="mini-stat-icon"><Pill size={16}/></span><span><strong>{member.failed && !member.medications ? 'Unavailable' : `${taken} / ${todayMeds.length}`}</strong><small>medicines taken</small></span></div></div>
          <div className="family-checkin-preview">{current.length ? current.map((item) => <div key={item.id}><span>{item.period === 'MORNING' ? 'Morning' : 'Night'}</span><StatusBadge status={checkInTone(item)}>{item.status === 'COMPLETED' && item.checkedInAt ? `Checked in ${clock(item.checkedInAt)}` : checkInLabel(item)}</StatusBadge></div>) : <p>Check-in details are unavailable.</p>}</div>
          <div className="family-card-links">
            <Link className="button button-primary button-small" to={`/family/elders/${encodeURIComponent(member.connection.elder.id)}/checkins`}>View elder <ArrowRight size={15}/></Link>
            <Link className="button button-secondary button-small" to={`/family/elders/${encodeURIComponent(member.connection.elder.id)}/sos`}>SOS</Link>
            <Link className="button button-secondary button-small" to={`/family/elders/${encodeURIComponent(member.connection.elder.id)}/medications`}>Medicines</Link>
          </div>
        </article>
      })}</div>
      <section className="dashboard-panel activity-panel"><div className="panel-heading"><div><span className="panel-icon sage"><Activity size={19}/></span><div><p className="panel-overline">TODAY</p><h2>Recent activity</h2></div></div></div>
        {activities.length === 0 ? <EmptyState title="No recent activity" description="Check-in, medication, and emergency updates will appear here when available."/> : <ul className="activity-list">{activities.map((activity, index) => <li key={`${activity.elder}-${activity.time}-${index}`}><span className={`activity-icon ${activity.kind}`}>{activity.kind === 'emergency' ? <ShieldAlert size={17}/> : activity.kind === 'checkin' ? <Check size={17}/> : <Pill size={17}/>}</span><span><strong>{activity.elder} {activity.text}</strong><small>{clock(activity.time)}</small></span></li>)}</ul>}
      </section>
      <div className="quick-actions">
        <Link to="/family/assistant" className="assistant-quick-action"><Sparkles size={18}/> AI assistant <ArrowRight size={15}/></Link>
        <Link to="/family/connections"><Users size={18}/> Manage connections <ArrowRight size={15}/></Link>
        <Link to="/family/emergencies" className="sos-quick-action"><ShieldAlert size={18}/> Emergency alerts <ArrowRight size={15}/></Link>
      </div>
    </>}
  </div>
}

function AdminDashboard({ name }: { name: string }) {
  return <div className="dashboard-page"><PageHeader eyebrow="ADMINISTRATOR" title={greeting(name)} description="Your account is ready."/><section className="dashboard-panel"><EmptyState title="Administration tools are not available yet" description="This application does not currently include user-management or system-management tools." icon={<Shield size={23}/>}/></section></div>
}
