import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Bell, CalendarDays, Plane, Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getSupabaseError, roleLabels, supabase } from '../lib/supabase'

function localDateValue() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function formatFlightTime(value) {
  if (!value) return 'Time not reported'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Time not reported'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Navbar({ children }) {
  const { profile, role } = useAuth()
  const canManageFlights = ['admin', 'operations_manager'].includes(role)
  const [routeQuery, setRouteQuery] = useState('')
  const [routeDate, setRouteDate] = useState(localDateValue)
  const [searchedRoute, setSearchedRoute] = useState(null)
  const [routeMatches, setRouteMatches] = useState([])
  const [routeErrors, setRouteErrors] = useState({ flights: '', alternatives: '' })
  const [routeQueryError, setRouteQueryError] = useState('')
  const [routeLoading, setRouteLoading] = useState(false)
  const [routePanelOpen, setRoutePanelOpen] = useState(false)
  const routeSearchRef = useRef(null)

  useEffect(() => {
    if (!routePanelOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!routeSearchRef.current?.contains(event.target)) setRoutePanelOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setRoutePanelOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [routePanelOpen])

  const loadRouteMatches = async (route, dateValue) => {
    setRouteLoading(true)
    setRouteMatches([])
    setRouteErrors({ flights: '', alternatives: '' })
    if (!supabase) {
      setRouteErrors({ flights: 'Supabase is not configured. Add your project URL and publishable key first.', alternatives: '' })
      setRouteLoading(false)
      return
    }

    const [year, month, day] = dateValue.split('-').map(Number)
    const dayStart = new Date(year, month - 1, day)
    const dayEnd = new Date(year, month - 1, day + 1)
    const from = dateValue === localDateValue() ? new Date() : dayStart
    if (Number.isNaN(dayStart.getTime()) || Number.isNaN(dayEnd.getTime())) {
      setRouteErrors({ flights: 'Choose a valid travel date.', alternatives: '' })
      setRouteLoading(false)
      return
    }

    try {
      const [flightResponse, alternativeResponse] = await Promise.all([
        supabase.from('flights')
          .select('id,flight_number,airline,origin,destination,scheduled_departure,estimated_departure,status')
          .ilike('origin', route.origin)
          .ilike('destination', route.destination)
          .gte('scheduled_departure', from.toISOString())
          .lt('scheduled_departure', dayEnd.toISOString())
          .order('scheduled_departure', { ascending: true })
          .limit(100),
        supabase.from('alternative_flights')
          .select('id,flight_number,airline,origin,destination,departure_at,available_seats,status')
          .ilike('origin', route.origin)
          .ilike('destination', route.destination)
          .gte('departure_at', from.toISOString())
          .lt('departure_at', dayEnd.toISOString())
          .order('departure_at', { ascending: true })
          .limit(100),
      ])
      setRouteErrors({
        flights: flightResponse.error ? getSupabaseError(flightResponse.error) : '',
        alternatives: alternativeResponse.error ? getSupabaseError(alternativeResponse.error) : '',
      })
      const scheduledFlights = (flightResponse.data || []).map((flight) => ({
        id: `scheduled-${flight.id}`,
        flightNumber: flight.flight_number,
        airline: flight.airline,
        departure: flight.scheduled_departure,
        status: flight.status,
        seats: null,
        seatDataAvailable: false,
      }))
      const alternatives = (alternativeResponse.data || []).map((flight) => ({
        id: `alternative-${flight.id}`,
        flightNumber: flight.flight_number,
        airline: flight.airline,
        departure: flight.departure_at,
        status: flight.status,
        seats: Number(flight.available_seats),
        seatDataAvailable: true,
      }))
      setRouteMatches([...scheduledFlights, ...alternatives].sort((a, b) => Date.parse(a.departure) - Date.parse(b.departure)))
    } catch (error) {
      setRouteErrors({ flights: getSupabaseError(error), alternatives: '' })
    } finally {
      setRouteLoading(false)
    }
  }

  const searchRoute = (event) => {
    event.preventDefault()
    setRoutePanelOpen(true)
    setRouteQueryError('')
    setRouteErrors({ flights: '', alternatives: '' })
    const match = routeQuery.trim().match(/^([a-z]{3})\s*(?:to|[-→])\s*([a-z]{3})$/i)
    if (!match) {
      setSearchedRoute(null)
      setRouteMatches([])
      setRouteQueryError('Enter two 3-letter airport codes, for example DEL to BOM.')
      return
    }
    const route = { origin: match[1].toUpperCase(), destination: match[2].toUpperCase() }
    if (route.origin === route.destination) {
      setSearchedRoute(null)
      setRouteMatches([])
      setRouteQueryError('Choose two different airports.')
      return
    }
    setSearchedRoute(route)
    loadRouteMatches(route, routeDate)
  }

  const searchSelectedDate = () => {
    if (searchedRoute) loadRouteMatches(searchedRoute, routeDate)
  }

  return (
    <header className="topbar">
      {children}
      <div className="topbar-context"><span className="context-mark"><Plane size={16} /></span><span>Operations control</span><span className="context-divider">/</span><strong>FlightCare</strong></div>
      <div className="route-search-widget" ref={routeSearchRef}>
        <form className="topbar-search" role="search" onSubmit={searchRoute}>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search flights by route"
            placeholder="Route, e.g. DEL to BOM"
            value={routeQuery}
            onChange={(event) => setRouteQuery(event.target.value)}
          />
          <button type="submit" aria-label="Find flights for this route" disabled={routeLoading}><ArrowRight size={17} /></button>
        </form>
        {routePanelOpen && <section className="route-search-panel" aria-label="Upcoming flight suggestions" aria-live="polite">
          <div className="route-search-panel-heading">
            <div>
              <span className="route-search-eyebrow">UPCOMING FLIGHTS</span>
              <h2>{searchedRoute ? `${searchedRoute.origin} to ${searchedRoute.destination}` : 'Search by airport route'}</h2>
              <p>Use 3-letter airport codes. Results use schedules saved in FlightCare.</p>
            </div>
            <button type="button" className="icon-button" aria-label="Close flight suggestions" onClick={() => setRoutePanelOpen(false)}><X size={19} /></button>
          </div>
          {routeQueryError && <p className="route-search-error" role="alert">{routeQueryError}</p>}
          {searchedRoute && <div className="route-search-date-row">
            <label><CalendarDays size={17} /><span>Travel date</span><input type="date" min={localDateValue()} value={routeDate} onChange={(event) => setRouteDate(event.target.value)} /></label>
            <button type="button" className="button button-primary" onClick={searchSelectedDate} disabled={routeLoading || !routeDate}>{routeLoading ? 'Searching…' : 'Find flights'}</button>
          </div>}
          {routeErrors.flights && <p className="route-search-error" role="alert">Flight schedules: {routeErrors.flights}</p>}
          {routeErrors.alternatives && <p className="route-search-error" role="status">Seat availability: {routeErrors.alternatives}</p>}
          {routeLoading ? <div className="route-search-empty"><span className="spinner" /> Finding upcoming flights…</div>
            : searchedRoute && routeMatches.length ? <div className="route-search-results">
              {routeMatches.map((flight) => {
                const hasAvailableSeats = flight.seatDataAvailable && flight.status === 'available' && flight.seats > 0
                const seatLabel = !flight.seatDataAvailable
                  ? 'Not reported'
                  : hasAvailableSeats ? `${flight.seats} seats available` : 'No seats listed'
                return <article className="route-search-result" key={flight.id}>
                  <div className="route-result-flight"><strong>{flight.flightNumber || 'Flight number not reported'}</strong><span>{flight.airline || 'Airline not reported'}</span></div>
                  <div className="route-result-time"><span>Departure</span><strong>{formatFlightTime(flight.departure)}</strong></div>
                  <div className="route-result-seats"><span>Seats</span><strong>{seatLabel}</strong></div>
                  <span className={`status-pill status-${flight.status || 'unknown'}`}>{flight.status?.replaceAll('_', ' ') || 'Not reported'}</span>
                </article>
              })}
            </div>             : searchedRoute && !routeErrors.flights && !routeErrors.alternatives && <div className="route-search-empty">
              <span>No saved flights were found for this route and date. {canManageFlights ? 'Add a real schedule in Flight management.' : 'Ask your FlightCare operations team to add a schedule.'} An administrator can load fictional demo records from <code>supabase/seed.sql</code>.</span>
              {canManageFlights && <Link className="text-link" to="/flights" onClick={() => setRoutePanelOpen(false)}>Manage schedules <ArrowRight size={15} /></Link>}
            </div>}
          <p className="route-search-note">Seat counts appear only for accessible rebooking alternatives. Regular schedules do not report seats, and ticket prices are not available here.</p>
        </section>}
      </div>
      <div className="topbar-actions">
        <Link className="icon-button notification-button" to={role === 'passenger' ? '/my-notifications' : '/notifications'} aria-label="Notifications"><Bell size={19} /><i /></Link>
        <Link className="user-chip" to="/profile" aria-label="Open your profile"><div className="avatar">{(profile?.full_name || profile?.email || 'F').slice(0, 1).toUpperCase()}</div><div><strong>{profile?.full_name || profile?.email || 'FlightCare User'}</strong><span>{roleLabels[role] || 'Account'}</span></div></Link>
      </div>
    </header>
  )
}
