import { useEffect, useState } from 'react'
import { Activity, CircleHelp, Plane, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Loading from '../components/Loading'
import StatCard from '../components/statcard'
import { getSupabaseError, settleSupabaseQuery, supabase } from '../lib/supabase'

export default function Analytics() {
  const [data, setData] = useState({ flights: [], disruptions: [], assistance: [], passengerCount: null })
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    let active = true
    async function load() {
      const results = await Promise.all([
        settleSupabaseQuery(supabase.from('flights').select('status,scheduled_departure')),
        settleSupabaseQuery(supabase.from('disruptions').select('type,status,created_at')),
        settleSupabaseQuery(supabase.from('assistance_requests').select('type,status,created_at')),
        settleSupabaseQuery(supabase.from('passengers').select('id', { count: 'exact', head: true })),
      ])
      if (!active) return
      setErrors({
        flights: results[0].error ? getSupabaseError(results[0].error) : '',
        disruptions: results[1].error ? getSupabaseError(results[1].error) : '',
        assistance: results[2].error ? getSupabaseError(results[2].error) : '',
        passengers: results[3].error ? getSupabaseError(results[3].error) : '',
      })
      setData({
        flights: results[0].data || [],
        disruptions: results[1].data || [],
        assistance: results[2].data || [],
        passengerCount: results[3].error ? null : results[3].count ?? 0,
      })
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])
  if (loading) return <Loading label="Preparing live analytics…" />
  const chartData = ['on_time', 'delayed', 'cancelled', 'diverted'].map((status) => ({ status: status.replaceAll('_', ' '), flights: data.flights.filter((flight) => flight.status === status).length }))
  const completionRate = data.assistance.length ? Math.round(data.assistance.filter((item) => item.status === 'completed').length / data.assistance.length * 100) : 0
  const disruptionsByType = [...new Set(data.disruptions.map((item) => item.type).filter(Boolean))].map((type) => ({ label: type.replaceAll('_', ' '), count: data.disruptions.filter((item) => item.type === type).length }))
  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">OPERATIONS <span>/</span> ANALYTICS</div><h1>Operational analytics</h1><p>Live summary from your FlightCare operational records.</p></div></div>
    <div className="stats-grid analytics-stats"><StatCard label="Flights tracked" value={errors.flights ? null : data.flights.length} detail="Schedule records" error={errors.flights} icon={Plane} tone="blue" /><StatCard label="Disruptions" value={errors.disruptions ? null : data.disruptions.length} detail="All recorded events" error={errors.disruptions} icon={Activity} tone="amber" /><StatCard label="Assistance requests" value={errors.assistance ? null : data.assistance.length} detail={errors.assistance ? 'Unavailable' : `${completionRate}% completed`} error={errors.assistance} icon={CircleHelp} tone="green" /><StatCard label="Passengers" value={data.passengerCount} detail="Passenger records" error={errors.passengers} icon={Users} tone="purple" /></div>
    <div className="dashboard-panels analytics-panels"><section className="panel wide-panel"><div className="panel-heading"><div><h2>Flight outcomes</h2><p>Distribution of all records currently visible to your role</p></div></div>
      {errors.flights ? <div className="section-error" role="alert">{errors.flights}</div> : data.flights.length ? <div className="bar-chart"><ResponsiveContainer width="100%" height={300}><BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e9edf4" /><XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fill: '#78859a', fontSize: 12 }} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#78859a', fontSize: 12 }} /><Tooltip cursor={{ fill: '#f4f7fb' }} /><Bar dataKey="flights" name="Flights" fill="#326de6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="chart-empty">Add flight records to populate analytics.</div>}
    </section><section className="panel side-panel"><div className="panel-heading"><div><h2>Disruptions by type</h2><p>Recorded disruption categories</p></div></div>
      {errors.disruptions ? <div className="section-error" role="alert">{errors.disruptions}</div> : disruptionsByType.length ? <div className="analytics-breakdown">{disruptionsByType.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.count}</strong><i style={{ width: `${Math.max(4, item.count / data.disruptions.length * 100)}%` }} /></div>)}</div> : <div className="mini-empty">No disruption data is available yet.</div>}
      <div className="analytics-note">All figures are queried from Supabase using the current user's access policies.</div>
    </section></div>
  </div>
}
