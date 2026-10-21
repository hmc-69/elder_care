import { ArrowUpRight, Check, HeartHandshake, Leaf, ShieldCheck, Wifi } from 'lucide-react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { AuthenticatedLayout } from './components/AuthenticatedLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { ElderCheckInPage } from './pages/ElderCheckInPage'
import { ElderConnectionsPage } from './pages/ElderConnectionsPage'
import { ElderMedicationsPage } from './pages/ElderMedicationsPage'
import { FamilyCheckInPage } from './pages/FamilyCheckInPage'
import { FamilyConnectionsPage } from './pages/FamilyConnectionsPage'
import { FamilyDirectoryPage, UnavailablePage } from './pages/FamilyDirectoryPage'
import { FamilyMedicationsPage } from './pages/FamilyMedicationsPage'
import { ElderSosPage } from './pages/ElderSosPage'
import { FamilyEmergenciesPage } from './pages/FamilyEmergenciesPage'
import { FamilyElderSosPage } from './pages/FamilyElderSosPage'
import { AssistantPage } from './pages/AssistantPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { getHealth } from './services/api'
import { useState } from 'react'

type ConnectionState = 'idle' | 'checking' | 'connected' | 'error'

function LandingPage() {
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const { user } = useAuth()
  if (user) return <Navigate to="/dashboard" replace/>

  async function checkConnection() {
    setConnection('checking')
    try { const health = await getHealth(); setConnection(health.status === 'ok' ? 'connected' : 'error') }
    catch { setConnection('error') }
  }

  return <main className="page-shell">
    <header className="topbar"><Link className="brand" to="/" aria-label="ElderCare Connect home"><span className="brand-mark"><HeartHandshake size={23}/></span><span>ElderCare <strong>Connect</strong></span></Link><nav aria-label="Main navigation"><a className="nav-link" href="#about">About</a><Link className="nav-link" to="/login">Sign in</Link><Link className="nav-link nav-register" to="/register">Create account</Link><a className="nav-link" href="#connection">System status</a></nav></header>
    <section className="hero" id="home" aria-labelledby="hero-title"><div className="hero-copy"><div className="eyebrow"><span className="eyebrow-dot"/> CARE THAT KEEPS YOU CONNECTED</div><h1 id="hero-title">Live independently.<br/><span>Feel connected.</span></h1><p className="hero-description">Thoughtful daily support for older adults and the people who care about them.</p><Link className="primary-button" to="/register">Get started <ArrowUpRight size={19}/></Link><div className="reassurance"><ShieldCheck size={18}/> Thoughtful support, with dignity at its heart</div></div>
      <div className="hero-art" aria-label="Illustration of a welcoming home and caring connection" role="img"><div className="sun-orb"/><div className="art-leaf leaf-one"><Leaf/></div><div className="art-leaf leaf-two"><Leaf/></div><div className="home-card"><div className="home-window"><span/><span/><span/><span/></div><div className="home-roof"/><div className="home-body"><div className="home-door"/><div className="home-window-front"/></div><div className="home-base"/></div><div className="floating-note"><span className="note-icon"><HeartHandshake size={20}/></span><span><strong>Here for you</strong><small>Every day, in every way</small></span><Check className="note-check" size={18}/></div><span className="art-caption">A little more peace of mind, every day.</span></div></section>
    <section className="intro" id="about" aria-labelledby="intro-title"><div className="intro-icon"><HeartHandshake size={25}/></div><div><p className="section-kicker">A MORE CONNECTED KIND OF CARE</p><h2 id="intro-title">Support for the life you love.</h2><p>Keep everyday routines and family connections close, in one calm and easy-to-use place.</p></div></section>
    <section className="connection-panel" id="connection" aria-labelledby="connection-title"><div className="connection-copy"><span className="connection-icon"><Wifi size={20}/></span><div><h2 id="connection-title">System connection</h2><p>Check that ElderCare Connect is ready to respond.</p></div></div><div className="connection-action"><button className="check-button" type="button" onClick={() => void checkConnection()} disabled={connection === 'checking'}>{connection === 'checking' ? 'Checking…' : 'Check connection'}</button>{connection !== 'idle' && <p className={`connection-result ${connection}`} role="status">{connection === 'connected' ? 'Backend connected' : connection === 'error' ? 'Could not reach the backend' : 'Connecting to backend…'}</p>}</div></section>
    <footer><Link className="footer-brand" to="/">ElderCare Connect</Link><span>Independent living, with a little more peace of mind.</span><span>© {new Date().getFullYear()} ElderCare Connect</span></footer>
  </main>
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<LandingPage/>}/>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/register" element={<RegisterPage/>}/>
    <Route element={<ProtectedRoute><AuthenticatedLayout/></ProtectedRoute>}>
      <Route path="/dashboard" element={<DashboardPage/>}/>
      <Route path="/profile" element={<ProfilePage/>}/>
      <Route path="/settings" element={<UnavailablePage title="Settings"/>}/>
      <Route path="/elder/connections" element={<ProtectedRoute roles={['ELDER']}><ElderConnectionsPage/></ProtectedRoute>}/>
      <Route path="/elder/medications" element={<ProtectedRoute roles={['ELDER']}><ElderMedicationsPage/></ProtectedRoute>}/>
      <Route path="/elder/check-in" element={<ProtectedRoute roles={['ELDER']}><ElderCheckInPage/></ProtectedRoute>}/>
      <Route path="/elder/sos" element={<ProtectedRoute roles={['ELDER']}><ElderSosPage/></ProtectedRoute>}/>
      <Route path="/elder/assistant" element={<ProtectedRoute roles={['ELDER']}><AssistantPage/></ProtectedRoute>}/>
      <Route path="/family/connections" element={<ProtectedRoute roles={['FAMILY']}><FamilyConnectionsPage/></ProtectedRoute>}/>
      <Route path="/family/elders" element={<ProtectedRoute roles={['FAMILY']}><FamilyDirectoryPage mode="elders"/></ProtectedRoute>}/>
      <Route path="/family/medications" element={<ProtectedRoute roles={['FAMILY']}><FamilyDirectoryPage mode="medications"/></ProtectedRoute>}/>
      <Route path="/family/check-ins" element={<ProtectedRoute roles={['FAMILY']}><FamilyDirectoryPage mode="checkins"/></ProtectedRoute>}/>
      <Route path="/family/emergencies" element={<ProtectedRoute roles={['FAMILY']}><FamilyEmergenciesPage/></ProtectedRoute>}/>
      <Route path="/family/assistant" element={<ProtectedRoute roles={['FAMILY']}><AssistantPage/></ProtectedRoute>}/>
      <Route path="/family/elders/:elderId/medications" element={<ProtectedRoute roles={['FAMILY']}><FamilyMedicationsPage/></ProtectedRoute>}/>
      <Route path="/family/elders/:elderId/checkins" element={<ProtectedRoute roles={['FAMILY']}><FamilyCheckInPage/></ProtectedRoute>}/>
      <Route path="/family/elders/:elderId/sos" element={<ProtectedRoute roles={['FAMILY']}><FamilyElderSosPage/></ProtectedRoute>}/>
      <Route path="*" element={<Navigate to="/dashboard" replace/>}/>
    </Route>
  </Routes>
}

function App() { return <BrowserRouter><AuthProvider><AppRoutes/></AuthProvider></BrowserRouter> }

export default App
