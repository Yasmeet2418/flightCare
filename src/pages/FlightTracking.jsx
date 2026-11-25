import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import {
  ArrowRight, CalendarDays, Clock3, Crosshair, Gauge, MapPin, Navigation,
  Plane, PlaneLanding, PlaneTakeoff, Radio, RefreshCw, Search,
} from 'lucide-react'
import { fetchAircraftByCallsign, fetchNearbyAircraft, fetchProviderFlights } from '../lib/flightData'
import './FlightTracking.css'

const INITIAL_CENTER = { latitude: 51.505, longitude: -0.09 }
const LIVE_REFRESH_MS = 5 * 60 * 1000
const STATUS_OPTIONS = ['scheduled', 'active', 'landed', 'cancelled', 'diverted', 'incident']
const INITIAL_FLIGHT_DATE = new Date().toISOString().slice(0, 10)

function formatNumber(value, suffix = '') {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'Not reported'
    : `${Math.round(Number(value)).toLocaleString()}${suffix}`
}

function formatDateTime(value) {
  if (!value) return 'Not reported'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not reported'
    : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function normalizeCommercialFlight(record) {
  const flight = record.flight || {}
  const airline = record.airline || {}
  const departure = record.departure || {}
  const arrival = record.arrival || {}
  const aircraft = record.aircraft || {}
  const delayMinutes = [record.departure?.delay, record.arrival?.delay]
    .map(Number)
    .find((delay) => Number.isFinite(delay) && delay > 0)
  const reportedStatus = String(record.flight_status || '').toLowerCase()
  const status = ['active', 'landed', 'cancelled', 'diverted', 'incident'].includes(reportedStatus)
    ? reportedStatus
    : delayMinutes ? 'delayed' : reportedStatus

  return {
    flightNumber: String(flight.iata || flight.icao || flight.number || '').trim(),
    airline: String(airline.name || airline.iata || 'Airline not reported').trim(),
    airlineCode: String(airline.iata || '').trim(),
    status,
    departureAirport: String(departure.airport || departure.iata || 'Airport not reported').trim(),
    departureCode: String(departure.iata || '').trim(),
    arrivalAirport: String(arrival.airport || arrival.iata || 'Airport not reported').trim(),
    arrivalCode: String(arrival.iata || '').trim(),
    scheduledDeparture: departure.scheduled || '',
    estimatedDeparture: departure.estimated || departure.actual || '',
    scheduledArrival: arrival.scheduled || '',
    estimatedArrival: arrival.estimated || arrival.actual || '',
    aircraft: [aircraft.registration, aircraft.icao24, aircraft.icao_code].filter(Boolean).join(' · '),
  }
}

function LiveAircraftMap({ aircraft, selectedHex, trails, area, dataScope, focusLocation, onSelect, onViewportChange }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  useEffect(() => {
    const map = L.map(containerRef.current, {
      center: [INITIAL_CENTER.latitude, INITIAL_CENTER.longitude],
      zoom: 1,
      minZoom: 0,
      zoomSnap: 0.5,
      maxBounds: [[-85, -180], [85, 180]],
      maxBoundsViscosity: 1,
    })
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      noWrap: true,
      attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a> and its contributors',
    }).addTo(map)
    map.fitBounds([[-85, -180], [85, 180]], { padding: [8, 8] })
    const layers = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 42,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => L.divIcon({
        className: 'flight-aircraft-cluster',
        html: `<span>${cluster.getChildCount()}</span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      }),
    }).addTo(map)
    mapRef.current = map
    layersRef.current = layers

    const handleViewportChange = () => {
      const center = map.getCenter()
      onViewportChange({ latitude: center.lat, longitude: center.lng })
    }
    map.on('moveend', handleViewportChange)
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      map.off('moveend', handleViewportChange)
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [onViewportChange])

  useEffect(() => {
    if (focusLocation) mapRef.current?.setView([focusLocation.latitude, focusLocation.longitude], 8)
  }, [focusLocation])

  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return
    const layers = layersRef.current
    layers.clearLayers()

    const positions = new Map(aircraft.map((plane) => [plane.hex, plane]))
    for (const [hex, points] of Object.entries(trails)) {
      const aircraftHere = positions.get(hex)
      if (points.length > 1 && aircraftHere && selectedHex === hex) {
        L.polyline(points, { color: '#c59b33', weight: 3, opacity: 0.75 }).addTo(layers)
      }
    }

    if (dataScope !== 'world') {
      L.circle([area.latitude, area.longitude], {
        radius: 250 * 1852,
        color: '#c59b33',
        weight: 1,
        opacity: 0.25,
        fillOpacity: 0.025,
        interactive: false,
      }).addTo(layers)
    }

    for (const plane of aircraft) {
      const heading = Number.isFinite(plane.heading) ? Math.round(plane.heading) : 0
      const marker = L.marker([plane.latitude, plane.longitude], {
        icon: L.divIcon({
          className: 'flight-marker-icon',
          html: `<svg viewBox="0 0 24 24" style="transform:rotate(${heading}deg)" aria-hidden="true"><path d="M12 2 9.4 10.1 2.5 13v2l6.3-1.1L10 22h4l1.2-8.1 6.3 1.1v-2l-6.9-2.9z"/></svg>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        title: plane.callsign || plane.hex || 'Aircraft',
      })
      marker.on('click', () => onSelect(plane))
      marker.addTo(layers)
    }
  }, [aircraft, area, dataScope, selectedHex, trails, onSelect])

  return <div ref={containerRef} className="flight-map-canvas" aria-label="Interactive map of live aircraft" />
}

function AircraftDetails({ aircraft, selectedFlight }) {
  if (!aircraft && !selectedFlight) {
    return <div className="flight-empty-state">Search a flight number or select an aircraft on the map to inspect reported information.</div>
  }

  const commercial = selectedFlight ? normalizeCommercialFlight(selectedFlight) : null
  const title = commercial?.flightNumber || aircraft?.callsign || aircraft?.hex || 'Flight details'
  const status = commercial?.status || (aircraft && !aircraft.onGround ? 'active' : '')

  return (
    <div className="flight-detail-content">
      <div className="flight-detail-title">
        <div className="flight-detail-icon"><Plane size={19} /></div>
        <div><strong>{title}</strong><span>{commercial?.airline || 'Airline not reported'}</span></div>
        {status && <span className={`flight-status flight-status-${status}`}>{status.replaceAll('_', ' ')}</span>}
      </div>
      {commercial && <div className="flight-route">
        <div><span>DEPARTURE</span><strong>{commercial.departureCode || '—'}</strong><small>{commercial.departureAirport}</small></div>
        <ArrowRight size={16} />
        <div><span>ARRIVAL</span><strong>{commercial.arrivalCode || '—'}</strong><small>{commercial.arrivalAirport}</small></div>
      </div>}
      <div className="flight-detail-grid">
        {commercial && <>
          <DetailItem icon={PlaneTakeoff} label="Scheduled departure" value={formatDateTime(commercial.scheduledDeparture)} />
          <DetailItem icon={PlaneTakeoff} label="Estimated departure" value={formatDateTime(commercial.estimatedDeparture)} />
          <DetailItem icon={PlaneLanding} label="Scheduled arrival" value={formatDateTime(commercial.scheduledArrival)} />
          <DetailItem icon={PlaneLanding} label="Estimated arrival" value={formatDateTime(commercial.estimatedArrival)} />
          <DetailItem icon={Plane} label="Aircraft" value={commercial.aircraft || 'Not reported'} />
        </>}
        {aircraft && <>
          <DetailItem icon={MapPin} label="Live position" value={`${aircraft.latitude.toFixed(4)}, ${aircraft.longitude.toFixed(4)}`} />
          <DetailItem icon={Navigation} label="Altitude" value={aircraft.onGround ? 'On ground' : formatNumber(aircraft.altitude, ' ft')} />
          <DetailItem icon={Gauge} label="Ground speed" value={formatNumber(aircraft.speed, ' kt')} />
          <DetailItem icon={Crosshair} label="Heading" value={formatNumber(aircraft.heading, '°')} />
          <DetailItem icon={Clock3} label="Position reported" value={formatDateTime(aircraft.seenAt)} />
          <DetailItem icon={Plane} label="Registration / type" value={[aircraft.registration, aircraft.aircraftType].filter(Boolean).join(' · ') || 'Not reported'} />
        </>}
      </div>
      {aircraft && <div className="flight-source-note"><Radio size={13} /> Live position from {aircraft.source || 'adsb.lol'} ADS-B data. Commercial schedule and status fields are provided separately when configured.</div>}
    </div>
  )
}

function DetailItem({ icon: Icon, label, value }) {
  return <div className="flight-detail-item"><span><Icon size={13} />{label}</span><strong>{value}</strong></div>
}

function FlightTracking() {
  const [aircraft, setAircraft] = useState([])
  const [trails, setTrails] = useState({})
  const [focusLocation, setFocusLocation] = useState(null)
  const [selectedAircraft, setSelectedAircraft] = useState(null)
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [area, setArea] = useState(INITIAL_CENTER)
  const [liveScope, setLiveScope] = useState('regional')
  const [loadingLive, setLoadingLive] = useState(true)
  const [liveError, setLiveError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [flightNumber, setFlightNumber] = useState('')
  const [searchingFlight, setSearchingFlight] = useState(false)
  const [flightError, setFlightError] = useState('')
  const [scheduleDate, setScheduleDate] = useState(INITIAL_FLIGHT_DATE)
  const [schedules, setSchedules] = useState([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [airlineFilter, setAirlineFilter] = useState('')
  const [airportFilter, setAirportFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const areaRef = useRef(INITIAL_CENTER)
  const liveScopeRef = useRef('regional')
  const liveRequestRef = useRef(null)
  const isLiveRequestActive = useRef(false)
  const viewportRefreshTimerRef = useRef(null)
  const selectAircraft = useCallback((plane) => {
    setSelectedAircraft(plane)
    setSelectedFlight(null)
  }, [])

  const refreshLiveFlights = useCallback(async (center = areaRef.current) => {
    if (isLiveRequestActive.current) liveRequestRef.current?.abort()
    isLiveRequestActive.current = true
    const controller = new AbortController()
    liveRequestRef.current = controller
    setLoadingLive(true)
    setLiveError('')
    try {
      const snapshot = await fetchNearbyAircraft(center, controller.signal)
      if (controller.signal.aborted) return
      const airborne = snapshot.aircraft.filter((plane) => !plane.onGround)
      liveScopeRef.current = snapshot.scope
      setLiveScope(snapshot.scope)
      setAircraft(airborne)
      setLastUpdated(snapshot.snapshotTime ? new Date(snapshot.snapshotTime) : new Date())
      setSelectedAircraft((current) => current && airborne.some((plane) => plane.hex === current.hex)
        ? airborne.find((plane) => plane.hex === current.hex)
        : current)
      setTrails((current) => {
        if (snapshot.scope === 'world') return current
        const next = Object.fromEntries(
          Object.entries(current).filter(([, points]) => points.at(-1)?.recordedAt > Date.now() - 20 * 60 * 1000),
        )
        for (const plane of airborne) {
          if (!plane.hex) continue
          const points = next[plane.hex] || []
          const last = points.at(-1)
          const moved = !last || Math.abs(last.latitude - plane.latitude) + Math.abs(last.longitude - plane.longitude) > 0.001
          next[plane.hex] = moved
            ? [...points, { latitude: plane.latitude, longitude: plane.longitude, recordedAt: Date.now() }].slice(-30)
            : points
        }
        return next
      })
    } catch (error) {
      if (!controller.signal.aborted) setLiveError(error.message || 'Could not load live aircraft positions.')
    } finally {
      if (!controller.signal.aborted) {
        isLiveRequestActive.current = false
        setLoadingLive(false)
      }
    }
  }, [])

  const handleViewportChange = useCallback((center) => {
    if (liveScopeRef.current === 'world') return
    areaRef.current = center
    setArea(center)
    setLoadingLive(true)
    window.clearTimeout(viewportRefreshTimerRef.current)
    viewportRefreshTimerRef.current = window.setTimeout(() => refreshLiveFlights(center), 750)
  }, [refreshLiveFlights])

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true)
    setScheduleError('')
    try {
      const data = await fetchProviderFlights('upcoming', { flightDate: scheduleDate })
      setSchedules(data.map(normalizeCommercialFlight))
    } catch (error) {
      setSchedules([])
      setScheduleError(error.message || 'Could not load upcoming flight schedules.')
    } finally {
      setLoadingSchedules(false)
    }
  }, [scheduleDate])

  useEffect(() => {
    const initialRequest = window.setTimeout(() => refreshLiveFlights(INITIAL_CENTER), 0)
    const timer = window.setInterval(() => refreshLiveFlights(areaRef.current), LIVE_REFRESH_MS)
    return () => {
      window.clearTimeout(initialRequest)
      window.clearInterval(timer)
      window.clearTimeout(viewportRefreshTimerRef.current)
      liveRequestRef.current?.abort()
      isLiveRequestActive.current = false
    }
  }, [refreshLiveFlights])

  useEffect(() => {
    const timer = window.setTimeout(loadSchedules, 0)
    return () => window.clearTimeout(timer)
  }, [loadSchedules])

  const searchFlight = async (event) => {
    event.preventDefault()
    if (!flightNumber.trim()) return
    setSearchingFlight(true)
    setFlightError('')
    setSelectedAircraft(null)
    setSelectedFlight(null)
    const normalizedCallsign = flightNumber.trim().toUpperCase().replace(/[\s-]/g, '')

    const [liveResult, commercialResult] = await Promise.allSettled([
      fetchAircraftByCallsign(normalizedCallsign),
      fetchProviderFlights('flight', { flightNumber: normalizedCallsign }),
    ])
    let liveAircraft = []
    let commercialFlight = null
    const errors = []

    if (liveResult.status === 'fulfilled') {
      liveAircraft = liveResult.value.filter((plane) => !plane.onGround)
      if (liveAircraft.length) {
        const selected = liveAircraft[0]
        setSelectedAircraft(selected)
        const center = { latitude: selected.latitude, longitude: selected.longitude }
        areaRef.current = center
        setArea(center)
        setFocusLocation(center)
        setAircraft((current) => [
          ...liveAircraft,
          ...current.filter((plane) => !liveAircraft.some((livePlane) => livePlane.hex === plane.hex)),
        ])
      }
    } else errors.push(liveResult.reason.message)

    if (commercialResult.status === 'fulfilled') {
      commercialFlight = commercialResult.value[0] || null
      setSelectedFlight(commercialFlight)
    } else errors.push(commercialResult.reason.message)

    if (!liveAircraft.length && !commercialFlight && errors.length) {
      setFlightError([...new Set(errors)].join(' '))
    } else if (!liveAircraft.length && !commercialFlight) {
      setFlightError(`No live aircraft or commercial flight record was returned for ${normalizedCallsign}.`)
    } else if (!liveAircraft.length) {
      setFlightError('No live ADS-B position is currently reported for this flight. Commercial details are shown when available.')
    } else if (!commercialFlight && commercialResult.status === 'rejected') {
      setFlightError(`Live ADS-B data is available. Commercial schedule and status: ${commercialResult.reason.message}`)
    }

    setSearchingFlight(false)
  }

  const locateUser = () => {
    if (!navigator.geolocation) {
      setLiveError('This browser does not support location lookup. Pan the map and refresh the selected area instead.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const center = { latitude: position.coords.latitude, longitude: position.coords.longitude }
        areaRef.current = center
        setArea(center)
        setFocusLocation(center)
        if (liveScopeRef.current !== 'world') refreshLiveFlights(center)
      },
      (error) => setLiveError(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Pan the map and refresh the selected area instead.'
        : 'Could not determine your location. Pan the map and refresh the selected area instead.'),
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  const filteredSchedules = useMemo(() => schedules.filter((flight) => {
    const airlineMatches = !airlineFilter || flight.airline === airlineFilter
    const airportQuery = airportFilter.trim().toLowerCase()
    const airportMatches = !airportQuery
      || `${flight.departureAirport} ${flight.departureCode} ${flight.arrivalAirport} ${flight.arrivalCode}`.toLowerCase().includes(airportQuery)
    const statusMatches = !statusFilter || flight.status === statusFilter
    return airlineMatches && airportMatches && statusMatches
  }), [schedules, airlineFilter, airportFilter, statusFilter])
  const airlines = useMemo(() => [...new Set(schedules.map((flight) => flight.airline).filter(Boolean))].sort(), [schedules])
  const displayedSelectedAircraft = selectedAircraft

  return (
    <div className="page-content flight-tracking">
      <div className="page-heading">
        <div><div className="eyebrow">FLIGHT OPERATIONS <span>/</span> LIVE TRACKING</div><h1>Flight tracking</h1><p>Live aircraft positions and provider-sourced commercial flight information.</p></div>
        <div className="heading-actions">
          <button type="button" className="button button-secondary" onClick={locateUser}><MapPin size={15} /> My area</button>
          <button type="button" className="button button-primary" onClick={() => refreshLiveFlights(area)} disabled={loadingLive}><RefreshCw size={15} className={loadingLive ? 'flight-spinning' : ''} /> Refresh map</button>
        </div>
      </div>

      <div className="flight-source-banner">
        <Radio size={15} />
        <span>{liveScope === 'world'
          ? <><strong>Worldwide live ADS-B positions</strong> are sourced from OpenSky. Commercial schedules and airline status are separate and only displayed when Aviationstack is configured.</>
          : <><strong>Regional live ADS-B positions</strong> are sourced from adsb.lol (250 nm per request). To load planes worldwide, configure <code>OPENSKY_CLIENT_ID</code> and <code>OPENSKY_CLIENT_SECRET</code> as Supabase Edge Function secrets.</>}</span>
      </div>

      <section className="flight-live-layout">
        <div className="panel flight-map-panel">
          <div className="panel-heading">
            <div><h2>Live aircraft map</h2><p>{liveScope === 'world'
              ? `Satellite world view · imagery is not live · ${aircraft.length.toLocaleString()} airborne aircraft`
              : `Satellite world view · imagery is not live · planes load within 250 nm of selected area · ${aircraft.length.toLocaleString()} in range`}</p></div>
            <span className="live-tag"><i /> {loadingLive ? 'Updating' : 'Live feed'}</span>
          </div>
          {liveError && <div className="flight-inline-error" role="alert">{liveError}</div>}
          <LiveAircraftMap
            aircraft={aircraft}
            selectedHex={selectedAircraft?.hex}
            trails={trails}
            area={area}
            dataScope={liveScope}
            focusLocation={focusLocation}
            onSelect={selectAircraft}
            onViewportChange={handleViewportChange}
          />
          <div className="flight-map-footer"><span><Crosshair size={13} /> {liveScope === 'world' ? 'Worldwide aircraft coverage' : `${area.latitude.toFixed(2)}, ${area.longitude.toFixed(2)} · 250 nm coverage`}</span><span>{lastUpdated ? `Updated ${formatDateTime(lastUpdated)}` : 'Waiting for first feed response'}</span></div>
        </div>

        <section className="panel flight-info-panel">
          <div className="panel-heading"><div><h2>Flight details</h2><p>Search a flight number, or select an aircraft marker.</p></div></div>
          <form className="flight-search-form" onSubmit={searchFlight}>
            <label className="search-field"><Search size={16} /><input value={flightNumber} onChange={(event) => setFlightNumber(event.target.value)} placeholder="e.g. BA123" aria-label="Flight number" /></label>
            <button type="submit" className="button button-primary" disabled={searchingFlight || !flightNumber.trim()}>{searchingFlight ? 'Searching…' : 'Search'}</button>
          </form>
          <p className="flight-search-help">Live positions come from adsb.lol. Airline and schedule details use Aviationstack; its key must be saved in Supabase Edge Function secrets, not the browser .env file.</p>
          {flightError && <div className="flight-inline-error flight-search-error" role="status">{flightError}</div>}
          <AircraftDetails aircraft={displayedSelectedAircraft} selectedFlight={selectedFlight} />
          {selectedAircraft && trails[selectedAircraft.hex]?.length > 1 && <div className="flight-track-note"><Navigation size={13} /> Blue line shows positions observed since tracking started on this page.</div>}
        </section>
      </section>

      <section className="panel flight-schedule-panel">
        <div className="panel-heading flight-schedule-heading">
          <div><h2>Upcoming flights</h2><p>Commercial schedules for the selected date. Requires Aviationstack Basic or higher.</p></div>
          <label className="flight-date-field"><CalendarDays size={15} /><input type="date" value={scheduleDate} min={INITIAL_FLIGHT_DATE} onChange={(event) => setScheduleDate(event.target.value)} aria-label="Schedule date" /></label>
        </div>
        {scheduleError && <div className="flight-provider-notice" role="status"><Radio size={15} /><span>{scheduleError} Live ADS-B tracking works independently of this commercial schedules provider.</span></div>}
        {!scheduleError && <div className="flight-schedule-filters">
          <label className="flight-filter"><span>Airline</span><select value={airlineFilter} onChange={(event) => setAirlineFilter(event.target.value)}><option value="">All airlines</option>{airlines.map((airline) => <option key={airline} value={airline}>{airline}</option>)}</select></label>
          <label className="flight-filter"><span>Airport</span><input value={airportFilter} onChange={(event) => setAirportFilter(event.target.value)} placeholder="Name or IATA code" /></label>
          <label className="flight-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        </div>}
        {loadingSchedules ? <div className="flight-table-message"><span className="spinner" /> Loading provider schedules…</div>
          : scheduleError ? <div className="flight-table-message">See the provider message above for why schedules are unavailable.</div>
            : filteredSchedules.length ? <div className="flight-schedule-list">
              <div className="flight-schedule-row flight-schedule-header"><span>FLIGHT / AIRLINE</span><span>DEPARTURE</span><span>ARRIVAL</span><span>STATUS</span></div>
              {filteredSchedules.map((flight, index) => <div className="flight-schedule-row" key={`${flight.flightNumber}-${flight.scheduledDeparture}-${index}`}>
                <div><strong>{flight.flightNumber || 'Flight number not reported'}</strong><small>{flight.airline}</small></div>
                <div><strong>{flight.departureCode || '—'}</strong><small>{formatDateTime(flight.scheduledDeparture)}</small></div>
                <div><strong>{flight.arrivalCode || '—'}</strong><small>{formatDateTime(flight.scheduledArrival)}</small></div>
                <span className={`flight-status flight-status-${flight.status || 'unknown'}`}>{flight.status || 'Not reported'}</span>
              </div>)}
            </div> : <div className="flight-table-message">{schedules.length ? 'No schedules match the selected filters.' : 'No schedule records were returned for this date.'}</div>}
      </section>

      <p className="flight-data-disclaimer">ADS-B position data is receiver-dependent and may be incomplete, delayed, or unavailable for some aircraft. Flight routes are only drawn from positions observed during this page session; no unreported schedule or position is estimated.</p>
    </div>
  )
}

export default FlightTracking
