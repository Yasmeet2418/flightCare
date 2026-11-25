import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, Check, CircleUserRound, Edit3, Plus, Trash2, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/DataTable'
import { useAuth } from '../context/useAuth'
import { useToast } from '../context/useToast'
import { getSupabaseError, settleSupabaseQuery, supabase } from '../lib/supabase'

function localDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function EntityPage({ config }) {
  const { user, role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const routeSearch = config.table === 'flights' ? searchParams.get('search') || '' : ''
  const toast = useToast()
  const [records, setRecords] = useState([])
  const [lookups, setLookups] = useState({})
  const [loading, setLoading] = useState(true)
  const [recordError, setRecordError] = useState('')
  const [lookupErrors, setLookupErrors] = useState({})
  const [search, setSearch] = useState('')
  const searchValue = config.table === 'flights' ? routeSearch : search
  const [filterValues, setFilterValues] = useState({})
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({})
  const [formError, setFormError] = useState('')
  const [selectedPassenger, setSelectedPassenger] = useState(null)
  const [passengerDetails, setPassengerDetails] = useState({ bookings: [], disruptions: [], assistance: [] })
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailErrors, setDetailErrors] = useState({})

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setRecordError('')
    setLookupErrors({})
    const lookupTables = [...new Set([
      ...config.fields.filter((field) => field.lookup).map((field) => field.lookup),
      ...config.columns.filter((column) => column.lookup).map((column) => column.lookup),
      ...(role === 'passenger' && ['assistance_requests', 'alternative_flights'].includes(config.table) ? ['passengers'] : []),
    ])]
    const [result, ...lookupResults] = await Promise.all([
      settleSupabaseQuery(supabase.from(config.table).select('*').order('created_at', { ascending: false }).limit(500)),
      ...lookupTables.map((table) => settleSupabaseQuery(supabase.from(table).select('*').limit(500))),
    ])
    if (result.error) {
      setRecordError(getSupabaseError(result.error))
      setRecords([])
    } else {
      setRecords(result.data || [])
    }
    const nextLookups = {}
    const nextLookupErrors = {}
    lookupTables.forEach((table, index) => {
      const lookupResult = lookupResults[index]
      if (lookupResult?.error) nextLookupErrors[table] = getSupabaseError(lookupResult.error)
      nextLookups[table] = lookupResult?.data || []
    })
    setLookups(nextLookups)
    setLookupErrors(nextLookupErrors)
    setLoading(false)
  }, [config, role])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => { if (active) loadRecords() }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [loadRecords])

  const changeSearch = (value) => {
    if (config.table !== 'flights') {
      setSearch(value)
      return
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('search', value)
      else next.delete('search')
      return next
    }, { replace: true })
  }

  const filtered = useMemo(() => records.filter((row) => {
    const matchesSearch = !searchValue || config.searchKeys.some((key) => String(row[key] ?? '').toLowerCase().includes(searchValue.toLowerCase()))
    const matchesFilters = Object.entries(filterValues).every(([key, value]) => !value || String(row[key] ?? '') === value)
    return matchesSearch && matchesFilters
  }), [records, searchValue, config, filterValues])

  const columns = config.columns.map((column) => ({
    ...column,
    render: column.lookup ? (value) => lookups[column.lookup]?.find((item) => item.id === value)?.[column.lookup === 'flights' ? 'flight_number' : column.lookup === 'passengers' ? 'full_name' : 'reason'] || 'Linked record' : column.suffix ? (value) => value === null ? '—' : `${value}${column.suffix}` : undefined,
  }))

  const startCreate = () => {
    setEditing('new')
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, field.defaultValue ?? (field.type === 'select' ? field.options?.[0] ?? '' : '')])))
    setFormError('')
  }
  const startEdit = (record) => {
    setEditing(record.id)
    setForm(Object.fromEntries(config.fields.map((field) => [field.key, field.type === 'datetime-local' ? localDateTime(record[field.key]) : record[field.key] ?? ''])))
    setFormError('')
  }
  const closeForm = () => { setEditing(null); setFormError('') }

  const submit = async (event) => {
    event.preventDefault()
    const missing = config.fields.find((field) => field.required && !String(form[field.key] ?? '').trim())
    if (missing) {
      setFormError(`${missing.label} is required.`)
      return
    }
    if (config.table === 'flights') {
      if (form.origin.trim().toLowerCase() === form.destination.trim().toLowerCase()) {
        setFormError('Origin and destination must be different airports.')
        return
      }
      const invalidDate = ['scheduled_departure', 'estimated_departure'].find((key) => (
        form[key] && Number.isNaN(Date.parse(form[key]))
      ))
      if (invalidDate) {
        setFormError(`${invalidDate === 'scheduled_departure' ? 'Scheduled' : 'Estimated'} departure must be a valid date and time.`)
        return
      }
    }
    const values = Object.fromEntries(config.fields.map((field) => {
      let value = form[field.key]
      if (field.type === 'datetime-local' && value) value = new Date(value).toISOString()
      if (field.type === 'number' && value !== '') value = Number(value)
      if (typeof value === 'string' && field.type !== 'datetime-local') value = value.trim()
      return [field.key, value === '' ? null : value]
    }))
    if (config.table === 'assistance_requests' && role === 'passenger') {
      const passengerRecord = lookups.passengers?.find((passenger) => passenger.user_id === user.id)
      if (!passengerRecord) {
        setFormError('Your passenger profile is not linked yet. Contact customer service.')
        return
      }
      values.passenger_id = passengerRecord.id
    }
    if (config.table === 'disruptions' && editing === 'new') values.reported_by = user.id
    setSaving(true)
    const result = editing === 'new'
      ? await supabase.from(config.table).insert(values).select('id').single()
      : config.table === 'flights'
        ? await supabase.from(config.table).update(values).eq('id', editing).select('id').maybeSingle()
        : await supabase.from(config.table).update(values).eq('id', editing)
    if (result.error || (config.table === 'flights' && editing !== 'new' && !result.data)) {
      setSaving(false)
      const message = result.error
        ? getSupabaseError(result.error)
        : 'Flight was not updated. It may have been removed or you may not have permission.'
      setFormError(message)
      toast(message, 'error')
      return
    }
    if (config.table === 'disruptions' && editing === 'new') {
      const { data: bookings, error: bookingError } = await supabase.from('bookings').select('id,passenger_id').eq('flight_id', values.flight_id)
      if (bookingError) {
        toast(`Disruption recorded, but affected passenger cases could not be loaded: ${getSupabaseError(bookingError)}`, 'error')
      } else if (bookings?.length) {
        const cases = bookings.map((booking) => ({
          disruption_id: result.data.id,
          passenger_id: booking.passenger_id,
          booking_id: booking.id,
          summary: values.reason,
          status: 'active',
        }))
        const { error: casesError } = await supabase.from('disruption_cases').insert(cases)
        if (casesError) toast(`Disruption recorded, but passenger cases could not be created: ${getSupabaseError(casesError)}`, 'error')
      }
    }
    setSaving(false)
    if (role !== 'passenger') {
      const { error: logError } = await supabase.from('activity_logs').insert({
        actor_id: user.id,
        action: editing === 'new' ? 'created' : 'updated',
        entity_type: config.table,
        entity_id: editing === 'new' ? result.data?.id ?? null : editing,
      })
      if (logError) toast(`Record saved, but activity logging failed: ${getSupabaseError(logError)}`, 'error')
    }
    toast(config.table === 'flights'
      ? editing === 'new' ? 'Flight created successfully.' : 'Flight updated successfully.'
      : editing === 'new' ? 'Record created successfully.' : 'Changes saved successfully.')
    closeForm()
    await loadRecords()
  }

  const remove = async (row) => {
    const name = row.flight_number || row.full_name || row.title || row.booking_reference || 'this record'
    if (!window.confirm(`Delete ${name}? This action cannot be undone.`)) return
    const deleteQuery = supabase.from(config.table).delete().eq('id', row.id)
    const { data: deleted, error: deleteError } = config.table === 'flights'
      ? await deleteQuery.select('id').maybeSingle()
      : await deleteQuery
    if (deleteError) toast(getSupabaseError(deleteError), 'error')
    else if (config.table === 'flights' && !deleted) toast('Flight was not deleted. It may have been removed or you may not have permission.', 'error')
    else {
      toast(config.table === 'flights' ? 'Flight deleted successfully.' : 'Record deleted.')
      if (role !== 'passenger') {
        const { error: logError } = await supabase.from('activity_logs').insert({ actor_id: user.id, action: 'deleted', entity_type: config.table, entity_id: row.id })
        if (logError) toast(`Record deleted, but activity logging failed: ${getSupabaseError(logError)}`, 'error')
      }
      await loadRecords()
    }
  }

  const selectAlternative = async (row) => {
    const ownPassenger = lookups.passengers?.find((item) => item.user_id === user.id)
    if (!ownPassenger) {
      toast('Your passenger profile is not linked yet. Contact customer service.', 'error')
      return
    }
    const { data: existing, error: existingError } = await supabase.from('passenger_options').select('id')
      .eq('passenger_id', ownPassenger.id).eq('disruption_id', row.disruption_id).eq('alternative_flight_id', row.id).maybeSingle()
    if (existingError) { toast(getSupabaseError(existingError), 'error'); return }
    if (existing) { toast('You already recorded a preference for this option.', 'error'); return }
    const { error: selectError } = await supabase.from('passenger_options').insert({
      passenger_id: ownPassenger.id,
      disruption_id: row.disruption_id,
      alternative_flight_id: row.id,
      decision: 'selected',
    })
    if (selectError) toast(getSupabaseError(selectError), 'error')
    else toast('Your preference has been recorded. No ticket or booking was created.')
  }

  const showPassengerDetails = async (passenger) => {
    setSelectedPassenger(passenger)
    setDetailLoading(true)
    setDetailErrors({})
    const results = await Promise.all([
      settleSupabaseQuery(supabase.from('bookings').select('id,booking_reference,seat,status,flights(flight_number,origin,destination,scheduled_departure)').eq('passenger_id', passenger.id).order('created_at', { ascending: false })),
      settleSupabaseQuery(supabase.from('disruption_cases').select('id,summary,status,disruptions(type,reason)').eq('passenger_id', passenger.id).order('created_at', { ascending: false })),
      settleSupabaseQuery(supabase.from('assistance_requests').select('id,subject,type,status,created_at').eq('passenger_id', passenger.id).order('created_at', { ascending: false })),
    ])
    setDetailErrors({
      bookings: results[0].error ? getSupabaseError(results[0].error) : '',
      disruptions: results[1].error ? getSupabaseError(results[1].error) : '',
      assistance: results[2].error ? getSupabaseError(results[2].error) : '',
    })
    setPassengerDetails({
      bookings: results[0].error ? [] : results[0].data || [],
      disruptions: results[1].error ? [] : results[1].data || [],
      assistance: results[2].error ? [] : results[2].data || [],
    })
    setDetailLoading(false)
  }

  const rowActions = (row) => (
    <>
      {config.table === 'passengers' && <button className="table-action" aria-label="View passenger details" title="Bookings and assistance" onClick={() => showPassengerDetails(row)}><CircleUserRound size={16} /></button>}
      {config.selectable && ownPassenger && row.status === 'available' && Number(row.available_seats) > 0 && <button className="table-action action-select" aria-label="Select this alternative" title="Record preference" onClick={() => selectAlternative(row)}><Check size={16} /></button>}
      {config.fields.length > 0 && !config.readOnly && (config.table !== 'assistance_requests' || role !== 'passenger') && <button className="table-action" aria-label="Edit record" title="Edit" onClick={() => startEdit(row)}><Edit3 size={15} /></button>}
      {config.table !== 'bookings' && config.table !== 'profiles' && config.table !== 'disruptions' && config.table !== 'alternative_flights' && config.table !== 'assistance_requests' && config.table !== 'notifications' && (config.table === 'passengers' ? role === 'admin' : role !== 'passenger') && <button className="table-action action-danger" aria-label="Delete record" title="Delete" onClick={() => remove(row)}><Trash2 size={15} /></button>}
    </>
  )

  const canCreate = Boolean(config.createLabel) && (config.table !== 'assistance_requests' || role !== 'passenger' || config.fields.length > 0)
  const ownPassenger = lookups.passengers?.find((passenger) => passenger.user_id === user?.id)
  const passengerActionUnavailable = role === 'passenger'
    && ['assistance_requests', 'alternative_flights'].includes(config.table)
    && (!ownPassenger || Boolean(lookupErrors.passengers))
  const missingRequiredLookup = config.fields.some((field) => (
    field.required && field.lookup && (!lookups[field.lookup]?.length || lookupErrors[field.lookup])
  ))
  const canCreateRecord = canCreate && !missingRequiredLookup && !(role === 'passenger' && config.table === 'assistance_requests' && passengerActionUnavailable)
  const lookupErrorList = Object.entries(lookupErrors)
  return (
    <div className="page-content">
      <div className="page-heading">
        <div><div className="eyebrow">FLIGHTCARE WORKSPACE <span>/</span> {config.title.toUpperCase()}</div><h1>{config.title}</h1><p>{config.description}</p></div>
        <div className="heading-actions"><button className="button button-secondary" type="button" onClick={loadRecords}><ArrowDownUp size={16} /> Refresh</button>{canCreateRecord && <button className="button button-primary" type="button" onClick={startCreate}><Plus size={17} /> {config.createLabel}</button>}</div>
      </div>
      {recordError && <div className="inline-error" role="alert"><strong>Could not load {config.title.toLowerCase()}.</strong> {recordError} <button type="button" onClick={loadRecords}>Retry</button></div>}
      {lookupErrorList.length > 0 && <div className="inline-error" role="alert"><strong>Related records are unavailable.</strong> {lookupErrorList.map(([table, message]) => `${table}: ${message}`).join(' · ')} Main records continue to load where possible. <button type="button" onClick={loadRecords}>Retry</button></div>}
      {passengerActionUnavailable && !lookupErrors.passengers && <div className="inline-error" role="status"><strong>Passenger profile not linked.</strong> This action is unavailable until your account has a matching passenger record.</div>}
      {config.table === 'assistance_requests' && role !== 'passenger' && <div className="info-banner"><strong>Service desk guidance</strong><span>Update status as the request progresses and use internal notes for staff-only context.</span></div>}
      {config.table === 'alternative_flights' && <div className="info-banner"><strong>Passenger choice stays in control</strong><span>Options are informational. A selection records a preference only; no booking or ticket is created.</span></div>}
      {config.table === 'profiles' && role === 'admin' && <div className="info-banner"><strong>Role safety</strong><span>Roles are assigned by the database when a profile is created. Profile edits cannot change your own role.</span></div>}
      <DataTable
        columns={columns} rows={filtered} loading={loading} search={searchValue} onSearch={changeSearch}
        filters={config.filters?.map((filter) => ({ ...filter, options: filter.options || [...new Set(records.map((row) => row[filter.key]).filter(Boolean))].sort() })) || []}
        filterValues={filterValues} onFilterChange={(key, value) => setFilterValues((current) => ({ ...current, [key]: value }))}
        actions={((config.fields.length > 0 && !config.readOnly) || config.selectable) ? rowActions : undefined}
        emptyTitle={recordError ? 'Data could not be loaded' : 'No records yet'}
        emptyText={recordError ? 'Check your Supabase configuration and table policies, then retry.' : 'Records will appear here when available.'}
      />
      {editing && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
          <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="modal-heading"><div><span className="eyebrow">FLIGHTCARE RECORD</span><h2 id="form-title">{editing === 'new' ? config.createLabel : 'Edit record'}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={closeForm}><X size={20} /></button></div>
            <form onSubmit={submit} noValidate>
              <div className="form-grid">
                {config.fields.filter((field) => !(field.key === 'passenger_id' && role === 'passenger') && !(field.key === 'role' && editing === user.id)).map((field) => (
                  <label className={`form-field ${field.type === 'textarea' ? 'field-wide' : ''}`} key={field.key}>
                    <span>{field.label}{field.required && <i> *</i>}</span>
                    {field.type === 'textarea' ? <textarea required={field.required} rows="3" value={form[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} /> : field.type === 'select' || field.type === 'lookup' ? (
                      <select required={field.required} value={form[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}>
                        {!field.required && <option value="">Select…</option>}
                        {(field.type === 'lookup' ? (lookups[field.lookup] || []).map((item) => ({ value: item.id, label: item[field.lookupLabel] || item.id })) : field.options.map((option) => ({ value: option, label: option.replaceAll('_', ' ') }))).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : <input type={field.type || 'text'} required={field.required} min={field.min} step={field.type === 'number' ? '1' : undefined} value={form[field.key] ?? ''} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} />}
                  </label>
                ))}
              </div>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <div className="modal-footer"><button type="button" className="button button-secondary" onClick={closeForm}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing === 'new' ? 'Create record' : 'Save changes'}</button></div>
            </form>
          </section>
        </div>
      )}
      {selectedPassenger && config.table === 'passengers' && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPassenger(null) }}>
          <section className="form-modal passenger-detail-modal" role="dialog" aria-modal="true" aria-labelledby="passenger-detail-title">
            <div className="modal-heading"><div><span className="eyebrow">PASSENGER RECORD</span><h2 id="passenger-detail-title">{selectedPassenger.full_name}</h2><p>{selectedPassenger.email} {selectedPassenger.phone ? `· ${selectedPassenger.phone}` : ''}</p></div><button className="icon-button" aria-label="Close passenger details" onClick={() => setSelectedPassenger(null)}><X size={20} /></button></div>
            {detailLoading ? <div className="table-loading"><span className="spinner" /> Loading linked records…</div> : <div className="passenger-detail-sections">
              <section><h3>Bookings & linked flights</h3>{detailErrors.bookings ? <p className="section-error" role="alert">{detailErrors.bookings}</p> : passengerDetails.bookings.length ? passengerDetails.bookings.map((item) => <div className="detail-list-row" key={item.id}><strong>{item.booking_reference}</strong><span>{item.flights?.flight_number || 'Flight unavailable'} · {item.flights ? `${item.flights.origin} → ${item.flights.destination}` : '—'}</span><small>{item.seat ? `Seat ${item.seat} · ` : ''}{item.status}</small></div>) : <p className="detail-empty">No bookings linked to this passenger.</p>}</section>
              <section><h3>Disruption status</h3>{detailErrors.disruptions ? <p className="section-error" role="alert">{detailErrors.disruptions}</p> : passengerDetails.disruptions.length ? passengerDetails.disruptions.map((item) => <div className="detail-list-row" key={item.id}><strong>{item.disruptions?.type?.replaceAll('_', ' ') || 'Disruption case'}</strong><span>{item.summary}</span><small>{item.status}</small></div>) : <p className="detail-empty">No disruption cases linked.</p>}</section>
              <section><h3>Assistance requests</h3>{detailErrors.assistance ? <p className="section-error" role="alert">{detailErrors.assistance}</p> : passengerDetails.assistance.length ? passengerDetails.assistance.map((item) => <div className="detail-list-row" key={item.id}><strong>{item.subject}</strong><span>{item.type?.replaceAll('_', ' ')}</span><small>{item.status}</small></div>) : <p className="detail-empty">No assistance requests linked.</p>}</section>
            </div>}
          </section>
        </div>
      )}
    </div>
  )
}
