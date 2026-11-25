import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowLeft, ArrowRight, CalendarClock, Edit3, Eye, MapPin, Plane, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { getSupabaseError, supabase } from '../lib/supabase'

const STATUSES = ['scheduled', 'on_time', 'delayed', 'cancelled', 'diverted']
const EMPTY_FORM = {
  flight_number: '', airline: '', origin: '', destination: '', scheduled_departure: '',
  arrival_at: '', aircraft_model: '', status: 'scheduled', terminal: '', gate: '',
}

function formatDate(value, withSeconds = false) {
  if (!value) return '—'
  return new Date(value).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  })
}

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function airlineMark(name) {
  return String(name || 'Airline').split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 2).toUpperCase()
}

export default function FlightManagement() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { role, user } = useAuth()
  const toast = useToast()
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ airline: '', origin: '', destination: '', status: '' })
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const loadFlights = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('flights')
      .select('*')
      .order('scheduled_departure', { ascending: true })
      .limit(500)
    if (loadError) {
      setError(getSupabaseError(loadError))
      setFlights([])
    } else {
      setFlights(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    loadFlights().then(() => { if (!active) return })
    return () => { active = false }
  }, [loadFlights])

  const airlines = useMemo(() => [...new Set(flights.map((flight) => flight.airline).filter(Boolean))].sort(), [flights])
  const origins = useMemo(() => [...new Set(flights.map((flight) => flight.origin).filter(Boolean))].sort(), [flights])
  const destinations = useMemo(() => [...new Set(flights.map((flight) => flight.destination).filter(Boolean))].sort(), [flights])
  const filtered = useMemo(() => flights.filter((flight) => {
    const matchesSearch = !search || String(flight.flight_number || '').toLowerCase().includes(search.toLowerCase())
    return matchesSearch
      && (!filters.airline || flight.airline === filters.airline)
      && (!filters.origin || flight.origin === filters.origin)
      && (!filters.destination || flight.destination === filters.destination)
      && (!filters.status || flight.status === filters.status)
  }), [flights, search, filters])

  const startCreate = () => {
    setEditing('new')
    setForm({ ...EMPTY_FORM })
    setFormError('')
  }

  const startEdit = (flight) => {
    setEditing(flight.id)
    setForm({
      flight_number: flight.flight_number || '', airline: flight.airline || '',
      origin: flight.origin || '', destination: flight.destination || '',
      scheduled_departure: localDateTime(flight.scheduled_departure),
      arrival_at: localDateTime(flight.arrival_at),
      aircraft_model: flight.aircraft_model || '', status: flight.status || 'scheduled',
      terminal: flight.terminal || '', gate: flight.gate || '',
    })
    setFormError('')
  }

  const closeForm = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
  }

  const submit = async (event) => {
    event.preventEvent?.()
    event.preventDefault()
    const required = ['flight_number', 'airline', 'origin', 'destination', 'scheduled_departure', 'arrival_at', 'status']
    const missing = required.find((key) => !String(form[key] || '').trim())
    if (missing) {
      setFormError('Complete all required flight fields.')
      return
    }
    for (const key of ['origin', 'destination']) {
      if (!/^[A-Z]{3}$/i.test(form[key].trim())) {
        setFormError(`${key === 'origin' ? 'Departure' : 'Arrival'} airport must be a 3-letter IATA code.`)
        return
      }
    }
    if (form.origin.trim().toUpperCase() === form.destination.trim().toUpperCase()) {
      setFormError('Departure and arrival airports must be different.')
      return
    }
    const departure = new Date(form.scheduled_departure)
    const arrival = new Date(form.arrival_at)
    if (Number.isNaN(departure.getTime()) || Number.isNaN(arrival.getTime())) {
      setFormError('Enter valid departure and arrival dates and times.')
      return
    }
    if (arrival <= departure) {
      setFormError('Arrival time must be after departure time.')
      return
    }

    setSaving(true)
    const values = {
      flight_number: form.flight_number.trim().toUpperCase(), airline: form.airline.trim(),
      origin: form.origin.trim().toUpperCase(), destination: form.destination.trim().toUpperCase(),
      scheduled_departure: departure.toISOString(), arrival_at: arrival.toISOString(),
      aircraft_model: form.aircraft_model.trim() || null, status: form.status,
      terminal: form.terminal.trim() || null, gate: form.gate.trim() || null,
    }
    const result = editing === 'new'
      ? await supabase.from('flights').insert(values).select('*').single()
      : await supabase.from('flights').update(values).eq('id', editing).select('*').maybeSingle()
    setSaving(false)
    if (result.error) {
      setFormError(getSupabaseError(result.error))
      toast(getSupabaseError(result.error), 'error')
      return
    }
    if (editing !== 'new' && !result.data) {
      setFormError('Flight was not updated. It may have been removed or you may not have permission.')
      return
    }
    if (role !== 'passenger') {
      await supabase.from('activity_logs').insert({
        actor_id: user.id,
        action: editing === 'new' ? 'created' : 'updated',
        entity_type: 'flights',
        entity_id: editing === 'new' ? result.data?.id ?? null : editing,
      })
    }
    toast(editing === 'new' ? 'Flight created successfully.' : 'Flight updated successfully.')
    closeForm()
    await loadFlights()
  }

  const removeFlight = async (flight) => {
    if (!window.confirm(`Delete flight ${flight.flight_number}? This action cannot be undone.`)) return
    const { data, error: deleteError } = await supabase.from('flights').delete().eq('id', flight.id).select('id').maybeSingle()
    if (deleteError) {
      toast(getSupabaseError(deleteError), 'error')
      return
    }
    if (!data) {
      toast('Flight was not deleted. It may have been removed or you may not have permission.', 'error')
      return
    }
    if (role !== 'passenger') {
      await supabase.from('activity_logs').insert({ actor_id: user.id, action: 'deleted', entity_type: 'flights', entity_id: flight.id })
    }
    toast('Flight deleted successfully.')
    if (id) navigate('/flights')
    await loadFlights()
  }

  const detailsFlight = id ? flights.find((flight) => flight.id === id) : null

  if (id) {
    if (loading) return <div className="flight-loading"><span className="spinner" /> Loading flight details…</div>
    if (!detailsFlight) return <div className="page-content"><Link className="flight-back" to="/flights"><ArrowLeft size={16} /> Back to flights</Link><div className="inline-error">Flight not found or unavailable. <button type="button" onClick={loadFlights}>Retry</button></div></div>
    return <FlightDetails flight={detailsFlight} onEdit={() => startEdit(detailsFlight)} onDelete={() => removeFlight(detailsFlight)} />
  }

  return (
    <div className="page-content flight-management">
      <div className="page-heading">
        <div><div className="eyebrow">OPERATIONS <span>/</span> FLIGHT CONTROL</div><h1>Flight management</h1><p>Monitor schedules, routes, aircraft, terminals and live flight status.</p></div>
        <div className="heading-actions"><button className="button button-secondary" type="button" onClick={loadFlights}><RefreshCw size={16} /> Refresh</button><button className="button button-primary" type="button" onClick={startCreate}><Plus size={17} /> Add flight</button></div>
      </div>

      {error && <div className="inline-error" role="alert"><strong>Flights could not be loaded.</strong> {error} <button type="button" onClick={loadFlights}>Retry</button></div>}

      <div className="flight-summary-grid">
        <div><span>Total flights</span><strong>{flights.length}</strong></div>
        <div><span>On time</span><strong className="summary-green">{flights.filter((item) => item.status === 'on_time').length}</strong></div>
        <div><span>Delayed</span><strong className="summary-orange">{flights.filter((item) => item.status === 'delayed').length}</strong></div>
        <div><span>Cancelled</span><strong className="summary-red">{flights.filter((item) => item.status === 'cancelled').length}</strong></div>
      </div>

      <section className="flight-list-card">
        <div className="flight-toolbar">
          <label className="flight-search"><span>Flight number</span><input aria-label="Search by flight number" placeholder="Search FC 204" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>Airline</span><select value={filters.airline} onChange={(event) => setFilters((current) => ({ ...current, airline: event.target.value }))}><option value="">All airlines</option>{airlines.map((airline) => <option key={airline} value={airline}>{airline}</option>)}</select></label>
          <label><span>Departure</span><select value={filters.origin} onChange={(event) => setFilters((current) => ({ ...current, origin: event.target.value }))}><option value="">All origins</option>{origins.map((origin) => <option key={origin} value={origin}>{origin}</option>)}</select></label>
          <label><span>Arrival</span><select value={filters.destination} onChange={(event) => setFilters((current) => ({ ...current, destination: event.target.value }))}><option value="">All destinations</option>{destinations.map((destination) => <option key={destination} value={destination}>{destination}</option>)}</select></label>
          <label><span>Status</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
        </div>

        {loading ? <div className="flight-loading"><span className="spinner" /> Loading flights…</div> : filtered.length === 0 ? <div className="empty-state"><div className="empty-mark"><Plane size={20} /></div><h3>{flights.length ? 'No flights match your filters' : 'No flights scheduled'}</h3><p>{flights.length ? 'Adjust the search or clear one of the filters.' : 'Add the first flight to start building the schedule.'}</p></div> : (
          <div className="flight-table-scroll"><table className="flight-table"><thead><tr><th>Flight</th><th>Route</th><th>Departure</th><th>Arrival</th><th>Status</th><th className="actions-heading">Actions</th></tr></thead><tbody>{filtered.map((flight) => (
            <tr key={flight.id}><td><div className="flight-airline"><div className="airline-mark">{airlineMark(flight.airline)}</div><div><strong>{flight.flight_number}</strong><span>{flight.airline}</span></div></div></td>
              <td><div className="route-cell"><strong>{flight.origin}</strong><ArrowRight size={14} /><strong>{flight.destination}</strong></div><span className="route-detail">{flight.terminal ? `Terminal ${flight.terminal}` : 'Terminal —'} · {flight.gate ? `Gate ${flight.gate}` : 'Gate —'}</span></td>
              <td><strong>{formatDate(flight.scheduled_departure)}</strong></td><td><strong>{formatDate(flight.arrival_at)}</strong></td>
              <td><span className={`status-pill status-${flight.status}`}>{flight.status?.replaceAll('_', ' ')}</span></td>
              <td><div className="row-actions"><Link className="table-action" to={`/flights/${flight.id}`} aria-label="View flight details" title="View details"><Eye size={16} /></Link><button className="table-action" type="button" onClick={() => startEdit(flight)} aria-label="Edit flight" title="Edit"><Edit3 size={16} /></button><button className="table-action action-danger" type="button" onClick={() => removeFlight(flight)} aria-label="Delete flight" title="Delete"><Trash2 size={16} /></button></div></td>
            </tr>
          ))}</tbody></table></div>
        )}
      </section>

      {editing && <FlightModal editing={editing} form={form} setForm={setForm} formError={formError} saving={saving} onClose={closeForm} onSubmit={submit} />}
    </div>
  )
}

function FlightModal({ editing, form, setForm, formError, saving, onClose, onSubmit }) {
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="form-modal flight-form-modal" role="dialog" aria-modal="true" aria-labelledby="flight-form-title">
      <div className="modal-heading"><div><span className="eyebrow">FLIGHT RECORD</span><h2 id="flight-form-title">{editing === 'new' ? 'Add new flight' : 'Edit flight'}</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
      <form onSubmit={onSubmit} noValidate>
        <div className="form-grid"><label className="form-field"><span>Flight number <i>*</i></span><input value={form.flight_number} onChange={change('flight_number')} placeholder="FC 204" required /></label><label className="form-field"><span>Airline <i>*</i></span><input value={form.airline} onChange={change('airline')} placeholder="FlightCare Airways" required /></label>
          <label className="form-field"><span>Departure airport <i>*</i></span><input value={form.origin} onChange={change('origin')} placeholder="JFK" maxLength="3" required /></label><label className="form-field"><span>Arrival airport <i>*</i></span><input value={form.destination} onChange={change('destination')} placeholder="LHR" maxLength="3" required /></label>
          <label className="form-field"><span>Departure date & time <i>*</i></span><input type="datetime-local" value={form.scheduled_departure} onChange={change('scheduled_departure')} required /></label><label className="form-field"><span>Arrival date & time <i>*</i></span><input type="datetime-local" value={form.arrival_at} onChange={change('arrival_at')} required /></label>
          <label className="form-field"><span>Aircraft model</span><input value={form.aircraft_model} onChange={change('aircraft_model')} placeholder="Airbus A321neo" /></label><label className="form-field"><span>Flight status <i>*</i></span><select value={form.status} onChange={change('status')} required>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
          <label className="form-field"><span>Terminal</span><input value={form.terminal} onChange={change('terminal')} placeholder="A" /></label><label className="form-field"><span>Gate</span><input value={form.gate} onChange={change('gate')} placeholder="B12" /></label></div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Create flight' : 'Save changes'}</button></div>
      </form>
    </section>
  </div>
}

function FlightDetails({ flight, onEdit, onDelete }) {
  const timeline = [
    { label: 'Scheduled departure', value: formatDate(flight.scheduled_departure), icon: CalendarClock, active: true },
    { label: 'Scheduled arrival', value: formatDate(flight.arrival_at), icon: Plane, active: Boolean(flight.arrival_at) },
  ]
  return <div className="page-content flight-details-page">
    <div className="flight-details-heading"><Link className="flight-back" to="/flights"><ArrowLeft size={16} /> Back to flights</Link><div><span className="eyebrow">FLIGHT DETAILS</span><h1>{flight.flight_number}</h1></div><div className="heading-actions"><button className="button button-secondary" type="button" onClick={onEdit}><Edit3 size={16} /> Edit flight</button><button className="button button-danger" type="button" onClick={onDelete}><Trash2 size={16} /> Delete</button></div></div>
    <section className="flight-hero-card"><div className="flight-hero-airline"><div className="airline-mark airline-mark-large">{airlineMark(flight.airline)}</div><div><span>{flight.airline}</span><strong>{flight.flight_number}</strong></div></div><div className="flight-route-hero"><div><strong>{flight.origin}</strong><span>Departure</span></div><div className="flight-route-line"><i /><Plane size={19} /><i /></div><div><strong>{flight.destination}</strong><span>Arrival</span></div></div><span className={`status-pill status-${flight.status}`}>{flight.status?.replaceAll('_', ' ')}</span></section>
    <div className="flight-details-grid"><section class="panel flight-info-panel"><h2>Flight information</h2><dl><div><dt>Flight number</dt><dd>{flight.flight_number}</dd></div><div><dt>Airline</dt><dd>{flight.airline}</dd></div><div><dt>Aircraft</dt><dd>{flight.aircraft_model || 'Not specified'}</dd></div><div><dt>Status</dt><dd><span className={`status-pill status-${flight.status}`}>{flight.status?.replaceAll('_', ' ')}</span></dd></div></dl></section>
      <section className="panel flight-info-panel"><h2>Departure & arrival</h2><dl><div><dt>Departure airport</dt><dd>{flight.origin}</dd></div><div><dt>Scheduled departure</dt><dd>{formatDate(flight.scheduled_departure)}</dd></div><div><dt>Arrival airport</dt><dd>{flight.destination}</dd></div><div><dt>Scheduled arrival</dt><dd>{formatDate(flight.arrival_at)}</dd></div></dl></section>
      <section className="panel flight-info-panel"><h2>Airport operations</h2><dl><div><dt>Terminal</dt><dd>{flight.terminal || '—'}</dd></div><div><dt>Gate</dt><dd>{flight.gate || '—'}</dd></div><div><dt>Created</dt><dd>{formatDate(flight.created_at)}</dd></div><div><dt>Updated</dt><dd>{formatDate(flight.updated_at)}</dd></div></dl></section>
      <section className="panel flight-timeline-panel"><h2>Flight timeline</h2><div className="flight-timeline">{timeline.map((item) => { const Icon = item.icon; return <div className={item.active ? 'timeline-item active' : 'timeline-item'} key={item.label}><div className="timeline-icon"><Icon size={17} /></div><div><strong>{item.label}</strong><span>{item.value}</span></div></div> })}</div></section></div>
  </div>
}
