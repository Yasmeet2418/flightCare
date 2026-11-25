import { useState } from 'react'
import { ArrowRight, Bell, Menu, Plane, Search } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { roleLabels } from '../lib/supabase'

export default function Navbar({ onMenuClick }) {
  const { profile, role } = useAuth()
  const navigate = useNavigate()
  const [flightSearch, setFlightSearch] = useState('')
  const canSearchFlights = ['admin', 'operations_manager'].includes(role)
  const searchFlights = (event) => {
    event.preventDefault()
    const query = flightSearch.trim()
    navigate({ pathname: '/flights', search: query ? `?search=${encodeURIComponent(query)}` : '' })
  }

  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" type="button" aria-label="Open navigation" onClick={onMenuClick}><Menu size={20} /></button>
      <div className="topbar-context"><span className="context-mark"><Plane size={16} /></span><span>Operations control</span><span className="context-divider">/</span><strong>FlightCare</strong></div>
      {canSearchFlights && <form className="topbar-search" role="search" onSubmit={searchFlights}>
        <Search size={17} aria-hidden="true" />
        <input aria-label="Search flights" placeholder="Search flights or routes" value={flightSearch} onChange={(event) => setFlightSearch(event.target.value)} />
        <button type="submit" aria-label="Open matching flights"><ArrowRight size={14} /></button>
      </form>}
      <div className="topbar-actions">
        <Link className="icon-button notification-button" to={role === 'passenger' ? '/my-notifications' : '/notifications'} aria-label="Notifications"><Bell size={19} /><i /></Link>
        <Link className="user-chip" to="/profile" aria-label="Open your profile"><div className="avatar">{(profile?.full_name || profile?.email || 'F').slice(0, 1).toUpperCase()}</div><div><strong>{profile?.full_name || profile?.email || 'FlightCare User'}</strong><span>{roleLabels[role] || 'Account'}</span></div></Link>
      </div>
    </header>
  )
}