import { useEffect, useState } from 'react'
import { Activity, Bell, Check, ChevronDown, CircleHelp, Heart, LayoutDashboard, LogOut, Menu, Pill, Settings, Shield, Sparkles, UserRound, Users, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

type NavItem = { label: string; to?: string; icon: typeof LayoutDashboard; unavailable?: boolean }

function navigationFor(role: string): NavItem[] {
  if (role === 'ELDER') return [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Medications', to: '/elder/medications', icon: Pill },
    { label: 'Daily check-in', to: '/elder/check-in', icon: Check },
    { label: 'Connections', to: '/elder/connections', icon: Users },
    { label: 'SOS emergency', to: '/elder/sos', icon: Shield },
    { label: 'AI assistant', icon: Sparkles, unavailable: true },
    { label: 'Profile', to: '/profile', icon: UserRound },
    { label: 'Settings', icon: Settings, unavailable: true },
  ]
  if (role === 'FAMILY') return [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'My elders', to: '/family/elders', icon: Heart },
    { label: 'Connections', to: '/family/connections', icon: Users },
    { label: 'Medications', to: '/family/medications', icon: Pill },
    { label: 'Check-ins', to: '/family/check-ins', icon: Activity },
    { label: 'SOS alerts', to: '/family/emergencies', icon: Shield },
    { label: 'AI assistant', icon: Sparkles, unavailable: true },
    { label: 'Profile', to: '/profile', icon: UserRound },
    { label: 'Settings', icon: Settings, unavailable: true },
  ]
  return [
    { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
    { label: 'Users', icon: Users, unavailable: true },
    { label: 'System management', icon: Settings, unavailable: true },
    { label: 'Profile', to: '/profile', icon: UserRound },
    { label: 'Settings', icon: Settings, unavailable: true },
  ]
}

const titles: Array<[string, string]> = [
  ['/dashboard', 'Dashboard'], ['/elder/medications', 'Medications'], ['/family/medications', 'Medications'],
  ['/elder/check-in', 'Daily check-in'], ['/family/check-ins', 'Check-ins'], ['/family/elders', 'My elders'],
  ['/elder/sos', 'SOS emergency'], ['/family/emergencies', 'Emergency alerts'],
  ['/family/elders/', 'Connected elder'],
  ['/family/connections', 'Connections'], ['/elder/connections', 'Connections'], ['/profile', 'Profile'], ['/settings', 'Settings'],
]

export function AuthenticatedLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false); setProfileMenuOpen(false) }, [location.pathname])
  if (!user) return null

  const title = location.pathname.startsWith('/family/elders/')
    ? location.pathname.endsWith('/checkins') ? 'Check-ins' : location.pathname.endsWith('/sos') ? 'SOS Emergency' : 'Medications'
    : titles.find(([path]) => location.pathname === path || location.pathname.startsWith(`${path}/`))?.[1] ?? 'ElderCare Connect'
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  const roleName = user.role === 'ELDER' ? 'Older adult' : user.role === 'FAMILY' ? 'Family member' : 'Administrator'

  async function signOut() {
    try { await logout() } finally { navigate('/login', { replace: true }) }
  }

  const sidebar = <aside className="app-sidebar" aria-label="Application navigation">
    <Link className="app-brand" to="/dashboard"><span className="app-brand-mark"><Heart size={20}/></span><span>ElderCare<small>CONNECT</small></span></Link>
    <p className="sidebar-label">WORKSPACE</p>
    <nav className="sidebar-nav" aria-label="Main navigation">{navigationFor(user.role).map(({ label, to, icon: Icon, unavailable }) => unavailable
      ? <span className="sidebar-item unavailable" key={label} aria-disabled="true"><Icon size={19} aria-hidden="true"/><span>{label}</span><small>Coming soon</small></span>
      : <NavLink className={({ isActive }) => {
        const nestedFamilySection = user.role === 'FAMILY' && ((label === 'Medications' && location.pathname.endsWith('/medications')) || (label === 'Check-ins' && location.pathname.endsWith('/checkins')) || (label === 'SOS alerts' && (location.pathname === '/family/emergencies' || location.pathname.endsWith('/sos'))))
        return `sidebar-item${isActive || nestedFamilySection ? ' active' : ''}`
      }} end={to === '/dashboard' || to === '/family/elders'} key={label} to={to!}><Icon size={19} aria-hidden="true"/><span>{label}</span></NavLink>)}</nav>
    <div className="sidebar-bottom"><div className="sidebar-help-icon"><CircleHelp size={19}/></div><strong>Here to help</strong><p>Your care, all in one place.</p><button type="button" onClick={() => navigate('/profile')}>View your profile</button></div>
    <Link className="sidebar-user" to="/profile" aria-label={`View profile for ${user.name}`}><span className="user-avatar">{initials}</span><span className="sidebar-user-copy"><strong>{user.name}</strong><small>{roleName}</small></span></Link>
  </aside>

  return <div className={`app-shell${menuOpen ? ' menu-open' : ''}`}>
    {menuOpen && <button className="drawer-scrim" aria-label="Close navigation menu" onClick={() => setMenuOpen(false)} />}
    {sidebar}
    <div className="app-main">
      <header className="app-header">
        <button className="icon-button mobile-menu-button" type="button" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={21}/> : <Menu size={21}/>}</button>
        <div className="header-title"><span className="header-kicker">ELDERCARE CONNECT</span><h1>{title}</h1></div>
        <div className="header-actions"><button className="icon-button notification-button" type="button" aria-label="Notifications are coming soon" title="Notifications coming soon" disabled><Bell size={19}/></button>
          <details className="profile-menu" open={profileMenuOpen} onToggle={(event) => setProfileMenuOpen((event.currentTarget as HTMLDetailsElement).open)}>
            <summary aria-label={`Open ${user.name}'s profile menu`}><span className="user-avatar">{initials}</span><span className="profile-menu-copy"><strong>{user.name}</strong><small>{roleName}</small></span><ChevronDown size={16}/></summary>
            <div className="profile-menu-popover"><Link to="/profile"><UserRound size={17}/>View profile</Link><Link to="/profile#change-password"><Shield size={17}/>Change password</Link><span className="menu-unavailable"><Settings size={17}/>Settings <small>Coming soon</small></span><button type="button" onClick={() => void signOut()}><LogOut size={17}/>Sign out</button></div>
          </details>
        </div>
      </header>
      <div className="app-content"><Outlet/></div>
    </div>
  </div>
}
