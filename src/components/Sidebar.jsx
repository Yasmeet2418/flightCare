import { NavLink, useNavigate } from 'react-router-dom'
import {
  Activity, Bell, BriefcaseBusiness, ChartNoAxesCombined, CircleHelp, FileClock,
  LayoutDashboard, LogOut, Plane, PlaneTakeoff, Settings, Shield, UserRound, Users, X,
} from 'lucide-react'
import { getSupabaseError } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'

const staff = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['staff'] },
  { to: '/flights', label: 'Flight management', icon: PlaneTakeoff, roles: ['admin', 'operations_manager'] },
  { to: '/disruptions', label: 'Disruptions', icon: Activity, roles: ['staff'] },
  { to: '/passengers', label: 'Passengers', icon: Users, roles: ['staff'] },
  { to: '/alternatives', label: 'Alternative flights', icon: Plane, roles: ['admin', 'operations_manager'] },
  { to: '/assistance', label: 'Assistance requests', icon: CircleHelp, roles: ['staff'] },
  { to: '/staff', label: 'Staff management', icon: Shield, roles: ['admin'] },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined, roles: ['admin', 'operations_manager'] },
  { to: '/notifications', label: 'Notifications', icon: Bell, roles: ['staff'] },
]
const passenger = [
  { to: '/portal', label: 'My dashboard', icon: LayoutDashboard },
  { to: '/my-bookings', label: 'My bookings', icon: BriefcaseBusiness },
  { to: '/my-disruptions', label: 'Disrupted flights', icon: Activity },
  { to: '/my-alternatives', label: 'Alternative flights', icon: Plane },
  { to: '/my-assistance', label: 'Assistance requests', icon: CircleHelp },
  { to: '/my-notifications', label: 'Notifications', icon: Bell },
]

export default function Sidebar({ open, onClose }) {
  const { role, logout, signingOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const links = role === 'passenger' ? passenger : staff.filter((item) => item.roles.includes(role) || (item.roles.includes('staff') && Boolean(role)))
  const handleLogout = async () => {
    const { error, signedOut } = await logout()
    if (error) {
      toast(
        signedOut
          ? `Signed out on this device, but server sign-out failed: ${getSupabaseError(error)}`
          : `Could not sign out: ${getSupabaseError(error)}`,
        'error',
      )
    }
    if (signedOut) navigate('/login', { replace: true })
  }
  return (
    <>
      {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-icon"><Plane size={20} fill="currentColor" /></div><div><strong>FlightCare</strong><span>DISRUPTION CONTROL</span></div><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><X size={19} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={18} /><span>{label}</span>{label === 'Assistance requests' && <span className="nav-indicator" />}</NavLink>)}
        </nav>
        <div className="side-bottom">
          <div className="workspace-label">PREFERENCES</div>
          <NavLink to="/profile" onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><UserRound size={18} /><span>Profile</span></NavLink>
          <NavLink to="/settings" onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Settings size={18} /><span>Settings</span></NavLink>
          {role !== 'passenger' && <div className="sidebar-status"><span className="live-dot" /><div><strong>Operations online</strong><small>Supabase connected session</small></div></div>}
          <button type="button" className="logout-link" onClick={handleLogout} disabled={signingOut}><LogOut size={18} /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button>
          <div className="sidebar-footer"><FileClock size={15} /> FlightCare workspace · 2026</div>
        </div>
      </aside>
    </>
  )
}