import { useEffect, useState } from 'react'
import { Activity, ArrowRight, BriefcaseBusiness, CircleHelp, Plane, PlaneLanding, PlaneTakeoff, Users } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Link } from 'react-router-dom'
import StatCard from '../components/statcard'
import Loading from '../components/Loading'
import { getSupabaseError, settleSupabaseQuery, supabase } from '../lib/supabase'

const statusColors = {
  on_time: '#287A46',
  scheduled: '#D3AA46',
  delayed: '#A97619',
  cancelled: '#C43B43',
  diverted: '#A97619',
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

export default function Dashboard() {
  const [data, setData] = useState({ flights: [], disruptions: [], assistance: [], passengers: null, activity: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let active = true
    async function load() {
      const results = await Promise.all([
        settleSupabaseQuery(supabase.from('flights').select('id,flight_number,airline,origin,destination,scheduled_departure,status').order('scheduled_departure', { ascending: true }).limit(200)),
        settleSupabaseQuery(supabase.from('disruptions').select('id,type,reason,status,created_at,flight_id').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('assistance_requests').select('id,type,subject,status,created_at').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('passengers').select('id', { count: 'exact', head: true })),
        settleSupabaseQuery(supabase.from('activity_logs').select('id,action,entity_type,created_at').order('created_at', { ascending: false }).limit(5)),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true })),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true }).eq('status', 'on_time')),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true }).eq('status', 'delayed')),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true }).eq('status', 'cancelled')),
        settleSupabaseQuery(supabase.from('disruptions').select('id', { count: 'exact', head: true }).neq('status', 'resolved')),
        settleSupabaseQuery(supabase.from('assistance_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true }).eq('status', 'scheduled')),
        settleSupabaseQuery(supabase.from('flights').select('id', { count: 'exact', head: true }).eq('status', 'diverted')),
      ])
      if (!active) return
      const firstError = (indexes) => {
        const result = indexes.map((index) => results[index]).find((item) => item.error)
        return result ? getSupabaseError(result.error) : ''
      }
      setErrors({
        flights: firstError([0]),
        flightStats: firstError([5, 6, 7, 8, 11, 12]),
        totalFlights: firstError([5]),
        onTime: firstError([6]),
        delayed: firstError([7]),
        cancelled: firstError([8]),
        scheduled: firstError([11]),
        diverted: firstError([12]),
        disruptions: firstError([1]),
        disruptionStats: firstError([9]),
        assistance: firstError([2]),
        assistanceStats: firstError([10]),
        passengers: firstError([3]),
        activity: firstError([4]),
      })
      setData({
        flights: results[0].data || [],
        disruptions: results[1].data || [],
        assistance: results[2].data || [],
        passengers: results[3].error ? null : results[3].count ?? 0,
        activity: results[4].data || [],
        stats: {
          totalFlights: results[5].error ? null : results[5].count ?? 0,
          onTime: results[6].error ? null : results[6].count ?? 0,
          delayed: results[7].error ? null : results[7].count ?? 0,
          cancelled: results[8].error ? null : results[8].count ?? 0,
          activeDisruptions: results[9].error ? null : results[9].count ?? 0,
          pendingRequests: results[10].error ? null : results[10].count ?? 0,
          scheduled: results[11].error ? null : results[11].count ?? 0,
          diverted: results[12].error ? null : results[12].count ?? 0,
        },
      })
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  if (loading) return <Loading label="Loading operations overview…" />
  const statusCounts = ['on_time', 'scheduled', 'delayed', 'cancelled', 'diverted'].map((status) => ({
    status,
    name: status.replaceAll('_', ' '), value: status === 'on_time' ? data.stats.onTime : status === 'delayed' ? data.stats.delayed : status === 'cancelled' ? data.stats.cancelled : status === 'scheduled' ? data.stats.scheduled : data.stats.diverted,
  })).filter((item) => item.value > 0)
  return (
    <div className="page-content">
      <div className="page-heading dashboard-heading"><div><div className="eyebrow">OPERATIONS CENTER <span>·</span> FLIGHTCARE</div><h1>Good morning, team <span className="wave">✦</span></h1><p>Here’s the latest operational picture across FlightCare.</p></div><Link className="button button-primary" to="/flights"><PlaneTakeoff size={17} /> View flight board</Link></div>
      <div className="stats-grid">
        <StatCard label="Total flights" value={data.stats.totalFlights} detail="Flights in current schedule" error={errors.totalFlights} icon={Plane} tone="blue" />
        <StatCard label="On-time flights" value={data.stats.onTime} detail={data.stats.totalFlights ? `${Math.round(data.stats.onTime / data.stats.totalFlights * 100)}% of listed flights` : 'No flight data yet'} error={errors.onTime} icon={PlaneLanding} tone="green" />
        <StatCard label="Delayed flights" value={data.stats.delayed} detail="Requires operational monitoring" error={errors.delayed} icon={Activity} tone="amber" />
        <StatCard label="Cancelled flights" value={data.stats.cancelled} detail="Review passenger impact" error={errors.cancelled} icon={Plane} tone="red" />
      </div>
      <div className="stats-grid stats-grid-secondary">
        <StatCard label="Active disruptions" value={data.stats.activeDisruptions} detail="Not yet resolved" error={errors.disruptionStats} icon={Activity} tone="purple" />
        <StatCard label="Passengers" value={data.passengers} detail="Passenger records" error={errors.passengers} icon={Users} tone="blue" />
        <StatCard label="Pending assistance" value={data.stats.pendingRequests} detail="Awaiting first response" error={errors.assistanceStats} icon={CircleHelp} tone="amber" />
      </div>
      <div className="dashboard-panels">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Flight status</h2><p>Current schedule distribution</p></div><span className="live-tag"><i /> Live data</span></div>
          {errors.flightStats ? <div className="section-error" role="alert">{errors.flightStats}</div> : statusCounts.length ? <div className="chart-content"><div className="chart-wrap"><ResponsiveContainer width="100%" height={210}><PieChart><Pie data={statusCounts} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={4} stroke="none">{statusCounts.map((entry) => <Cell key={entry.name} fill={statusColors[entry.status]} />)}</Pie><Tooltip formatter={(value, name) => [value, name]} /></PieChart></ResponsiveContainer><div className="chart-total"><strong>{data.stats.totalFlights}</strong><span>Flights</span></div></div><div className="chart-legend">{statusCounts.map((item) => <div key={item.name}><i style={{ backgroundColor: statusColors[item.status] }} /><span>{item.name}</span><strong>{item.value}</strong></div>)}</div></div> : <div className="chart-empty">Flight status chart will appear when flight records are available.</div>}
        </section>
        <section className="panel disruption-panel">
          <div className="panel-heading"><div><h2>Recent disruptions</h2><p>Latest reported operational events</p></div><Link to="/disruptions" className="text-link">View all <ArrowRight size={14} /></Link></div>
          {errors.disruptions ? <div className="section-error" role="alert">{errors.disruptions}</div> : data.disruptions.length ? <div className="list-stack">{data.disruptions.map((item) => <div className="event-row" key={item.id}><div className="event-icon"><Activity size={17} /></div><div className="event-copy"><strong>{item.type?.replaceAll('_', ' ') || 'Disruption'}</strong><span>{item.reason}</span><small>{formatTime(item.created_at)}</small></div><span className={`status-pill status-${item.status}`}>{item.status}</span></div>)}</div> : <div className="mini-empty">No disruption records to display.</div>}
        </section>
        <section className="panel wide-panel">
          <div className="panel-heading"><div><h2>Upcoming flights</h2><p>Next departures in the schedule</p></div><Link to="/flights" className="text-link">Flight board <ArrowRight size={14} /></Link></div>
          {errors.flights ? <div className="section-error" role="alert">{errors.flights}</div> : data.flights.length ? <div className="table-scroll"><table><thead><tr><th>Flight</th><th>Route</th><th>Departure</th><th>Airline</th><th>Status</th></tr></thead><tbody>{data.flights.slice(0, 5).map((flight) => <tr key={flight.id}><td><strong>{flight.flight_number}</strong></td><td>{flight.origin} <span className="route-arrow">→</span> {flight.destination}</td><td>{formatTime(flight.scheduled_departure)}</td><td>{flight.airline}</td><td><span className={`status-pill status-${flight.status}`}>{flight.status?.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div> : <div className="mini-empty">No flights have been added to the schedule yet.</div>}
        </section>
        <section className="panel side-panel">
          <div className="panel-heading"><div><h2>Assistance queue</h2><p>Latest passenger requests</p></div><Link to="/assistance" className="text-link">Manage <ArrowRight size={14} /></Link></div>
          {errors.assistance ? <div className="section-error" role="alert">{errors.assistance}</div> : data.assistance.length ? <div className="list-stack">{data.assistance.slice(0, 4).map((item) => <div className="request-row" key={item.id}><div><strong>{item.subject}</strong><span>{item.type?.replaceAll('_', ' ')}</span></div><span className={`status-pill status-${item.status}`}>{item.status}</span></div>)}</div> : <div className="mini-empty">No assistance requests right now.</div>}
          <div className="recent-activity"><h3>Recent activity</h3>{errors.activity ? <div className="section-error" role="alert">{errors.activity}</div> : data.activity.length ? data.activity.map((item) => <div className="activity-row" key={item.id}><i /><span>{item.action?.replaceAll('_', ' ') || 'Update'} <strong>{item.entity_type?.replaceAll('_', ' ') || 'record'}</strong></span><time>{formatTime(item.created_at)}</time></div>) : <div className="activity-empty"><BriefcaseBusiness size={15} /> Activity will appear as records are updated.</div>}</div>
        </section>
      </div>
    </div>
  )
}