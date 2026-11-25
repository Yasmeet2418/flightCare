import { supabase } from './supabase'

async function invokeFlightFunction(operation, parameters, signal) {
  if (!supabase) {
    throw new Error('Supabase is not configured. Copy .env.example to .env, set your real project URL and publishable key, then restart Vite.')
  }

  const { data, error } = await supabase.functions.invoke('flight-data', {
    body: { operation, ...parameters },
    signal,
  })

  if (error) {
    if (error.context instanceof Response) {
      const response = error.context
      if (response.headers.get('Content-Type')?.includes('application/json')) {
        const details = await response.clone().json()
        const message = details?.error || details?.message || details?.msg
        if (typeof message === 'string') throw new Error(message)
      }
      if (response.status === 404) {
        throw new Error('The flight-data Edge Function was not found. Deploy it with `supabase functions deploy flight-data`.')
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('Supabase rejected the Edge Function request. Sign in again and check that flight-data requires a valid Supabase session.')
      }
      if (response.status === 429) {
        throw new Error('The flight-data provider rate limit was reached. Try again later.')
      }
      throw new Error(`The flight-data Edge Function returned HTTP ${response.status}.`)
    }
    if (error.name === 'FunctionsFetchError') {
      throw new Error('Could not connect to Supabase Edge Functions. Verify VITE_SUPABASE_URL, network access, and that flight-data is deployed to this Supabase project.')
    }
    throw new Error(error.message || 'The flight-data function could not be reached.')
  }
  if (data?.error) throw new Error(data.error)
  return data
}

function normalizeAircraft(record, snapshotTime, source = 'adsb.lol') {
  const latitude = Number.parseFloat(String(record.lat))
  const longitude = Number.parseFloat(String(record.lon))
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null

  const positionAge = Number(record.seen_pos)
  const altitude = typeof record.alt_baro === 'number'
    ? record.alt_baro
    : typeof record.alt_geom === 'number' ? record.alt_geom : null
  const speed = record.gs === null || record.gs === undefined || record.gs === '' ? null : Number(record.gs)
  const heading = record.track === null || record.track === undefined || record.track === '' ? null : Number(record.track)
  const verticalRate = record.baro_rate === null || record.baro_rate === undefined || record.baro_rate === '' ? null : Number(record.baro_rate)

  return {
    hex: String(record.hex || '').toUpperCase(),
    callsign: String(record.flight || '').trim(),
    latitude,
    longitude,
    altitude,
    altitudeSource: typeof record.alt_baro === 'number' ? 'barometric' : typeof record.alt_geom === 'number' ? 'geometric' : null,
    speed: Number.isFinite(speed) ? speed : null,
    heading: Number.isFinite(heading) ? heading : null,
    verticalRate: Number.isFinite(verticalRate) ? verticalRate : null,
    aircraftType: String(record.t || '').trim(),
    registration: String(record.r || '').trim(),
    operator: String(record.ownOp || '').trim(),
    onGround: record.alt_baro === 'ground',
    source,
    seenAt: Number.isFinite(positionAge) && Number.isFinite(snapshotTime)
      ? new Date(snapshotTime - positionAge * 1000).toISOString()
      : null,
  }
}

function normalizeSnapshotTime(value) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return null
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
}

export async function fetchNearbyAircraft(center, signal) {
  const latitude = Number(center.latitude)
  const longitude = Number(center.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Choose a valid map location before refreshing live aircraft.')
  }

  const payload = await invokeFlightFunction('live', { latitude, longitude }, signal)
  const snapshotTime = normalizeSnapshotTime(payload?.now)
  const aircraft = Array.isArray(payload?.aircraft) ? payload.aircraft : []
  const source = typeof payload?.source === 'string' ? payload.source : 'adsb.lol'

  return {
    aircraft: aircraft.map((record) => normalizeAircraft(record, snapshotTime, source)).filter(Boolean),
    snapshotTime,
    scope: payload?.scope === 'world' ? 'world' : 'regional',
    source,
  }
}

export async function fetchAircraftByCallsign(value, signal) {
  const callsign = String(value).trim().toUpperCase().replace(/\s+/g, '')
  if (!/^[A-Z0-9]{2,8}$/.test(callsign)) {
    throw new Error('Enter a flight number or callsign using 2–8 letters and numbers.')
  }

  const payload = await invokeFlightFunction('callsign', { callsign }, signal)
  const snapshotTime = normalizeSnapshotTime(payload?.now)
  return Array.isArray(payload?.aircraft)
    ? payload.aircraft.map((record) => normalizeAircraft(record, snapshotTime)).filter(Boolean)
    : []
}

export async function fetchProviderFlights(operation, parameters) {
  const payload = await invokeFlightFunction(operation, parameters)
  if (!Array.isArray(payload?.data)) throw new Error('The flight-data provider returned an unexpected response.')
  return payload.data
}
