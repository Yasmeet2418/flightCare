import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  Activity, Bell, BriefcaseBusiness, ChartNoAxesCombined, ChevronDown, CircleHelp, FileClock,
  LayoutDashboard, LogOut, Menu, Plane, PlaneTakeoff, Radio, Settings, Shield, UserRound, Users,
} from 'lucide-react'
import { getSupabaseError } from '../lib/supabase'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'

const staff = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['staff'] },
  { to: '/flights', label: 'Flight management', icon: PlaneTakeoff, roles: ['admin', 'operations_manager'] },
  { to: '/tracking', label: 'Flight tracking', icon: Radio, roles: ['staff'] },
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
  { to: '/tracking', label: 'Flight tracking', icon: Plane },
  { to: '/my-bookings', label: 'My bookings', icon: BriefcaseBusiness },
  { to: '/my-disruptions', label: 'Disrupted flights', icon: Activity },
  { to: '/my-alternatives', label: 'Alternative flights', icon: Plane },
  { to: '/my-assistance', label: 'Assistance requests', icon: CircleHelp },
  { to: '/my-notifications', label: 'Notifications', icon: Bell },
]

export default function Sidebar() {
  const { role, logout, signingOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const toggleRef = useRef(null)
  const links = role === 'passenger' ? passenger : staff.filter((item) => item.roles.includes(role) || (item.roles.includes('staff') && Boolean(role)))
  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  const closeMenu = () => setOpen(false)
  const handleLogout = async () => {
    closeMenu()
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
    <div className="navigation-dropdown" ref={menuRef}>
      <button ref={toggleRef} className={`nav-dropdown-toggle ${open ? 'nav-dropdown-open' : ''}`} type="button" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen((isOpen) => !isOpen)}>
        <Menu size={19} /><span>Menu</span><ChevronDown size={16} />
      </button>
      {open && <aside className="sidebar" id="workspace-navigation">
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={20} /><span>{label}</span>{label === 'Assistance requests' && <span className="nav-indicator" />}</NavLink>)}
        </nav>
        <div className="side-bottom">
          <div className="workspace-label">PREFERENCES</div>
          <NavLink to="/profile" onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><UserRound size={20} /><span>Profile</span></NavLink>
          <NavLink to="/settings" onClick={closeMenu} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Settings size={20} /><span>Settings</span></NavLink>
          {role !== 'passenger' && <div className="sidebar-status"><span className="live-dot" /><div><strong>Operations online</strong><small>Supabase connected session</small></div></div>}
          <button type="button" className="logout-link" onClick={handleLogout} disabled={signingOut}><LogOut size={20} /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button>
          <div className="sidebar-footer"><FileClock size={16} /> FlightCare workspace · 2026</div>
        </div>
      </aside>}
    </div>
  )
}