const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function respond(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extraHeaders } })
}

function isIataFlightNumber(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{2,8}$/.test(value)
}

function isValidCallsign(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{2,8}$/.test(value)
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

let openSkyToken = ''
let openSkyTokenExpiresAt = 0
let openSkySnapshotCache: {
  snapshotTime: number
  aircraft: Record<string, unknown>[]
  expiresAt: number
} | null = null

async function getOpenSkyToken() {
  if (openSkyToken && openSkyTokenExpiresAt > Date.now() + 60_000) return openSkyToken

  const clientId = Deno.env.get('OPENSKY_CLIENT_ID')
  const clientSecret = Deno.env.get('OPENSKY_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('Worldwide tracking requires OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET Supabase Edge Function secrets.')
  }

  const response = await fetch('https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(`OpenSky authentication returned HTTP ${response.status}. Check the two OpenSky Supabase secrets.`)
  }

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('OpenSky authentication returned an unexpected response.')
  }
  const result = payload as Record<string, unknown>
  if (typeof result.access_token !== 'string' || !result.access_token) {
    throw new Error('OpenSky authentication response did not contain an access token.')
  }

  const expiresIn = Number(result.expires_in)
  openSkyToken = result.access_token
  openSkyTokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) ? Math.max(60, expiresIn - 60) : 1740) * 1000
  return openSkyToken
}

function normalizeOpenSkyState(state: unknown, snapshotTime: number) {
  if (!Array.isArray(state) || state.length < 11) return null
  const longitude = state[5]
  const latitude = state[6]
  if (state[8] !== false || typeof longitude !== 'number' || typeof latitude !== 'number'
    || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

  const positionTime = state[3]
  return {
    hex: typeof state[0] === 'string' ? state[0] : '',
    flight: typeof state[1] === 'string' ? state[1] : '',
    lat: latitude,
    lon: longitude,
    alt_baro: typeof state[7] === 'number' ? state[7] * 3.28084 : null,
    alt_geom: typeof state[13] === 'number' ? state[13] * 3.28084 : null,
    gs: typeof state[9] === 'number' ? state[9] * 1.943844 : null,
    track: typeof state[10] === 'number' ? state[10] : null,
    baro_rate: typeof state[11] === 'number' ? state[11] * 196.850394 : null,
    ...(typeof positionTime === 'number' ? { seen_pos: Math.max(0, snapshotTime - positionTime) } : {}),
  }
}

async function fetchOpenSkyWorldwide() {
  if (openSkySnapshotCache && openSkySnapshotCache.expiresAt > Date.now()) return openSkySnapshotCache

  const token = await getOpenSkyToken()
  const response = await fetch('https://opensky-network.org/api/states/all', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    throw new Error(response.status === 429
      ? 'OpenSky worldwide request limit reached. Wait before refreshing the global aircraft feed.'
      : `OpenSky returned HTTP ${response.status} for the worldwide aircraft feed.`)
  }

  const payload: unknown = await response.json()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('OpenSky returned an unexpected worldwide aircraft response.')
  }
  const result = payload as Record<string, unknown>
  const states = result.states === null ? [] : result.states
  if (typeof result.time !== 'number' || !Number.isFinite(result.time) || !Array.isArray(states)) {
    throw new Error('OpenSky returned an incomplete worldwide aircraft response.')
  }

  openSkySnapshotCache = {
    snapshotTime: result.time,
    aircraft: states.map((state) => normalizeOpenSkyState(state, result.time)).filter((state): state is Record<string, unknown> => state !== null),
    expiresAt: Date.now() + 60_000,
  }
  return openSkySnapshotCache
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond({ error: 'Only POST requests are supported.' }, 405)

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return respond({ error: 'The request body must be a JSON object.' }, 400)
    }
    body = parsed as Record<string, unknown>
  } catch {
    return respond({ error: 'The request body must be valid JSON.' }, 400)
  }

  const operation = body.operation
  if (!['live', 'callsign', 'flight', 'upcoming'].includes(String(operation))) {
    return respond({ error: 'Supported operations are live, callsign, flight, and upcoming.' }, 400)
  }
  let upstreamUrl: URL
  const upstreamHeaders: Record<string, string> = {}
  let openSkyRequest = false

  if (operation === 'live' || operation === 'callsign') {
    if (operation === 'live') {
      const latitude = Number(body.latitude)
      const longitude = Number(body.longitude)
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return respond({ error: 'Choose a valid map location before refreshing live aircraft.', code: 'INVALID_MAP_LOCATION' }, 400)
      }
      const openSkyClientId = Deno.env.get('OPENSKY_CLIENT_ID')
      const openSkyClientSecret = Deno.env.get('OPENSKY_CLIENT_SECRET')
      if (openSkyClientId && openSkyClientSecret) {
        openSkyRequest = true
        upstreamUrl = new URL('https://opensky-network.org/api/states/all')
      } else {
        const adsbKey = Deno.env.get('ADSBLOL_API_KEY')
        if (adsbKey) upstreamHeaders['x-api-key'] = adsbKey
        upstreamUrl = new URL(`/v2/lat/${latitude}/lon/${longitude}/dist/250`, 'https://api.adsb.lol')
      }
    } else {
      const callsign = typeof body.callsign === 'string' ? body.callsign.trim().toUpperCase() : ''
      if (!isValidCallsign(callsign)) {
        return respond({ error: 'Enter a flight number or callsign using 2–8 letters and numbers.', code: 'INVALID_CALLSIGN' }, 400)
      }
      const adsbKey = Deno.env.get('ADSBLOL_API_KEY')
      if (adsbKey) upstreamHeaders['x-api-key'] = adsbKey
      upstreamUrl = new URL(`/v2/callsign/${encodeURIComponent(callsign)}`, 'https://api.adsb.lol')
    }
  } else {
    const accessKey = Deno.env.get('AVIATIONSTACK_ACCESS_KEY')
      || Deno.env.get('AVIATIONSTACK_API_KEY')
    if (!accessKey) {
      return respond({
        error: 'Commercial flight search needs AVIATIONSTACK_ACCESS_KEY or AVIATIONSTACK_API_KEY in Supabase Edge Function secrets. A key in the browser .env or an ADSBLOL_API_KEY does not enable this provider.',
        code: 'PROVIDER_NOT_CONFIGURED',
      }, 503)
    }

    const params = new URLSearchParams({ access_key: accessKey, limit: '100' })
    let endpoint: string

    if (operation === 'flight') {
      const flightNumber = typeof body.flightNumber === 'string'
        ? body.flightNumber.trim().toUpperCase().replace(/[\s-]/g, '')
        : ''
      if (!isIataFlightNumber(flightNumber)) {
        return respond({ error: 'Enter a flight number using 2–8 letters and numbers.', code: 'INVALID_FLIGHT_NUMBER' }, 400)
      }
      endpoint = 'flights'
      params.set('flight_iata', flightNumber)
    } else if (operation === 'upcoming') {
      if (!isValidDate(body.flightDate)) {
        return respond({ error: 'Choose a valid schedule date in YYYY-MM-DD format.', code: 'INVALID_FLIGHT_DATE' }, 400)
      }
      endpoint = 'flight_schedules'
      params.set('flight_date', body.flightDate)
    } else {
      return respond({ error: 'Supported operations are live, callsign, flight, and upcoming.' }, 400)
    }

    upstreamUrl = new URL(`https://api.aviationstack.com/v1/${endpoint}`)
    upstreamUrl.search = params.toString()
  }

  try {
    if (openSkyRequest) {
      const snapshot = await fetchOpenSkyWorldwide()
      return respond({
        now: snapshot.snapshotTime,
        aircraft: snapshot.aircraft,
        scope: 'world',
        source: 'OpenSky',
      })
    }

    const upstream = await fetch(upstreamUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(12000),
    })
    const payload: unknown = await upstream.json()
    if (!upstream.ok) {
      if (operation === 'live' || operation === 'callsign') {
        const retryAfter = upstream.headers.get('Retry-After')
        return respond({
          error: upstream.status === 429
            ? `The adsb.lol request limit was reached.${retryAfter ? ` Try again in ${retryAfter} seconds.` : ' Try again later.'}`
            : `adsb.lol returned an HTTP ${upstream.status} response.`,
          code: upstream.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_ERROR',
        }, upstream.status === 429 ? 429 : 502, retryAfter ? { 'Retry-After': retryAfter } : {})
      }
      if (operation === 'upcoming' && upstream.status === 404) {
        return respond({
          error: 'Aviationstack rejected the flight_schedules endpoint (HTTP 404). Upcoming commercial schedules require an Aviationstack Basic or higher plan. Flight-number lookup and live ADS-B tracking are separate.',
          code: 'SCHEDULE_PLAN_REQUIRED',
        }, 502)
      }
      const accessHint = upstream.status === 401 || upstream.status === 403
        ? ' Verify AVIATIONSTACK_ACCESS_KEY or AVIATIONSTACK_API_KEY in Supabase Edge Function secrets and confirm your provider plan allows this endpoint.'
        : ' Check the provider plan and request limits.'
      return respond({
        error: `Aviationstack returned HTTP ${upstream.status}.${accessHint}`,
        code: upstream.status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_ERROR',
      }, upstream.status === 429 ? 429 : 502)
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return respond({ error: 'Aviationstack returned an unexpected response.', code: 'INVALID_PROVIDER_RESPONSE' }, 502)
    }
    const result = payload as {
      data?: unknown
      error?: { message?: string }
      ac?: unknown
      now?: number
    }
    if (operation === 'live' || operation === 'callsign') {
      if (!Array.isArray(result.ac) || !Number.isFinite(result.now)) {
        return respond({ error: 'adsb.lol returned an unexpected aircraft response.', code: 'INVALID_PROVIDER_RESPONSE' }, 502)
      }
      const rawAircraft = result.ac
      const fields = ['hex', 'flight', 'lat', 'lon', 'alt_baro', 'alt_geom', 'gs', 'track', 'baro_rate', 't', 'r', 'ownOp', 'seen_pos']
      const aircraft = rawAircraft
        .filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === 'object' && !Array.isArray(record))
        .map((record) => Object.fromEntries(fields.filter((field) => field in record).map((field) => [field, record[field]])))
      return respond({
        now: result.now,
        aircraft,
        scope: operation === 'live' ? 'regional' : 'flight',
        source: 'adsb.lol',
      })
    }
    if (result.error) {
      const message = typeof result.error.message === 'string'
        ? result.error.message
        : 'The commercial flight provider rejected the request.'
      return respond({
        error: operation === 'upcoming'
          ? `${message} Flight schedules require Aviationstack Basic or higher.`
          : message,
        code: operation === 'upcoming' ? 'SCHEDULE_PLAN_REQUIRED' : 'PROVIDER_ERROR',
      }, 502)
    }
    if (!Array.isArray(result.data)) {
      return respond({ error: 'Aviationstack returned an unexpected flight-data response.', code: 'INVALID_PROVIDER_RESPONSE' }, 502)
    }
    return respond({ data: result.data })
  } catch (error) {
    const provider = openSkyRequest ? 'OpenSky' : operation === 'live' || operation === 'callsign' ? 'adsb.lol' : 'Aviationstack'
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? `${provider} did not respond before the request timed out.`
      : openSkyRequest && error instanceof Error && error.message.startsWith('OpenSky ')
        ? error.message
      : `Could not reach ${provider}. Check the Edge Function logs and try again.`
    return respond({ error: message, code: openSkyRequest ? 'OPENSKY_PROVIDER_ERROR' : 'PROVIDER_UNAVAILABLE' }, 502)
  }
})
