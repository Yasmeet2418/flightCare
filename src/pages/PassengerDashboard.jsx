import { useEffect, useState } from 'react'
import { ArrowRight, Bell, BriefcaseBusiness, CircleHelp, Plane, PlaneTakeoff } from 'lucide-react'
import { Link } from 'react-router-dom'
import StatCard from '../components/statcard'
import Loading from '../components/Loading'
import { useAuth } from '../context/useAuth'
import { getSupabaseError, settleSupabaseQuery, supabase } from '../lib/supabase'

export default function PassengerDashboard() {
  const { profile } = useAuth()
  const [data, setData] = useState({ bookings: [], disruptions: [], requests: [], notifications: [] })
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    let active = true
    async function load() {
      const results = await Promise.all([
        settleSupabaseQuery(supabase.from('bookings').select('*, flights(flight_number,airline,origin,destination,scheduled_departure)').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('disruption_cases').select('*').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('assistance_requests').select('*').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5)),
      ])
      if (!active) return
      setErrors({
        bookings: results[0].error ? getSupabaseError(results[0].error) : '',
        disruptions: results[1].error ? getSupabaseError(results[1].error) : '',
        requests: results[2].error ? getSupabaseError(results[2].error) : '',
        notifications: results[3].error ? getSupabaseError(results[3].error) : '',
      })
      setData({ bookings: results[0].data || [], disruptions: results[1].data || [], requests: results[2].data || [], notifications: results[3].data || [] })
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])
  if (loading) return <Loading label="Loading your travel overview…" />
  const activeCases = errors.disruptions ? null : data.disruptions.filter((item) => item.status !== 'resolved').length
  const openRequests = errors.requests ? null : data.requests.filter((item) => !['completed', 'cancelled'].includes(item.status)).length
  return (
    <div className="page-content">
      <div className="page-heading dashboard-heading"><div><div className="eyebrow">PASSENGER PORTAL <span>·</span> YOUR TRAVEL</div><h1>Welcome back, {profile?.full_name?.split(' ')[0] || 'traveller'}</h1><p>Your bookings, support requests, and travel updates in one place.</p></div><Link className="button button-primary" to="/my-assistance"><CircleHelp size={17} /> Get assistance</Link></div>
      <div className="stats-grid passenger-stats">
        <StatCard label="My bookings" value={errors.bookings ? null : data.bookings.length} detail="Confirmed booking records" error={errors.bookings} icon={BriefcaseBusiness} tone="blue" />
        <StatCard label="Disrupted flights" value={activeCases} detail="Cases needing your attention" error={errors.disruptions} icon={Plane} tone="amber" />
        <StatCard label="Open support requests" value={openRequests} detail="Updates from the service team" error={errors.requests} icon={CircleHelp} tone="green" />
      </div>
      <div className="dashboard-panels passenger-panels">
        <section className="panel wide-panel"><div className="panel-heading"><div><h2>Your recent bookings</h2><p>Only bookings linked to your account are shown</p></div><Link to="/my-bookings" className="text-link">All bookings <ArrowRight size={14} /></Link></div>
          {errors.bookings ? <div className="section-error" role="alert">{errors.bookings}</div> : data.bookings.length ? <div className="table-scroll"><table><thead><tr><th>Reference</th><th>Flight</th><th>Route</th><th>Seat</th><th>Status</th></tr></thead><tbody>{data.bookings.map((item) => <tr key={item.id}><td><strong>{item.booking_reference}</strong></td><td>{item.flights?.flight_number || '—'}</td><td>{item.flights ? `${item.flights.origin} → ${item.flights.destination}` : '—'}</td><td>{item.seat || '—'}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td></tr>)}</tbody></table></div> : <div className="mini-empty">No bookings are currently linked to this account.</div>}
        </section>
        <section className="panel side-panel"><div className="panel-heading"><div><h2>Travel updates</h2><p>Latest notifications</p></div><Bell size={17} /></div>
          {errors.notifications ? <div className="section-error" role="alert">{errors.notifications}</div> : data.notifications.length ? <div className="list-stack">{data.notifications.map((item) => <div className="event-row" key={item.id}><div className="event-icon"><PlaneTakeoff size={16} /></div><div className="event-copy"><strong>{item.title}</strong><span>{item.message}</span><small>{new Date(item.created_at).toLocaleString()}</small></div></div>)}</div> : <div className="mini-empty">You’re all caught up. New updates will appear here.</div>}
        </section>
        <section className="panel wide-panel"><div className="panel-heading"><div><h2>Disruption cases</h2><p>Updates related to your bookings</p></div><Link to="/my-disruptions" className="text-link">View cases <ArrowRight size={14} /></Link></div>
          {errors.disruptions ? <div className="section-error" role="alert">{errors.disruptions}</div> : data.disruptions.length ? <div className="list-stack">{data.disruptions.map((item) => <div className="request-row" key={item.id}><div><strong>{item.summary || 'Flight disruption update'}</strong><span>{item.status?.replaceAll('_', ' ')}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></div>)}</div> : <div className="mini-empty">No disruption cases linked to your account.</div>}
        </section>
      </div>
    </div>
  )
}
