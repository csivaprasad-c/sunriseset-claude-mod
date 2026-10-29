import type { EngineInterface, Register } from 'claude-code'

type Place = { name: string; lat: number; lon: number; tz?: string; isApprox?: boolean }
type Day = { rise?: number; set?: number; polar?: 'day' | 'night' }

const KEY = 'place'
const RAD = Math.PI / 180

// The sunrise equation (NOAA's simplified form), for the day that is
// current at the place's longitude. Times are epoch milliseconds.
const sunDay = (now: number, lat: number, lon: number): Day => {
  const julian = now / 86400000 + 2440587.5
  const n = Math.round(julian + lon / 360 - 2451545)
  const mean = n - lon / 360
  const m = (357.5291 + 0.98560028 * mean) % 360
  const c = 1.9148 * Math.sin(m * RAD) + 0.02 * Math.sin(2 * m * RAD) + 0.0003 * Math.sin(3 * m * RAD)
  const ecliptic = (m + c + 180 + 102.9372) % 360
  const transit = 2451545 + mean + 0.0053 * Math.sin(m * RAD) - 0.0069 * Math.sin(2 * ecliptic * RAD)
  const decl = Math.asin(Math.sin(ecliptic * RAD) * Math.sin(23.4397 * RAD))
  const cosHour =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) / (Math.cos(lat * RAD) * Math.cos(decl))

  if (cosHour > 1) return { polar: 'night' }
  if (cosHour < -1) return { polar: 'day' }

  const hour = Math.acos(cosHour) / RAD / 360
  const toMs = (j: number) => (j - 2440587.5) * 86400000

  return { rise: toMs(transit - hour), set: toMs(transit + hour) }
}

const clock = (ms: number, place: Place): string => {
  if (place.tz) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: place.tz,
      }).format(new Date(ms))
    } catch {}
  }
  // No time zone known: approximate one from the longitude.
  const offset = Math.round(place.lon / 15)
  const d = new Date(ms + offset * 3600000)
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC${offset >= 0 ? '+' : ''}${offset}`
}

const describe = (now: number, place: Place): string => {
  const day = sunDay(now, place.lat, place.lon)
  const where = place.isApprox ? `${place.name} (from IP)` : place.name

  if (day.polar === 'day') return `☀ Midnight sun today · ${where}`
  if (day.polar === 'night') return `☾ Polar night today · ${where}`

  return `☀ Sunrise ${clock(day.rise!, place)} · ☾ Sunset ${clock(day.set!, place)} · ${where}`
}

async function fetchJson($: EngineInterface, url: string): Promise<any> {
  const res = await $.http.fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return JSON.parse(res.text)
}

async function geocode($: EngineInterface, query: string): Promise<Place | undefined> {
  const data = await fetchJson(
    $,
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(query)}`,
  )
  const hit = data?.results?.[0]
  if (!hit) return undefined
  const name = [hit.name, hit.admin1, hit.country_code].filter(Boolean).join(', ')
  return { name, lat: hit.latitude, lon: hit.longitude, tz: hit.timezone }
}

async function fromIp($: EngineInterface): Promise<Place> {
  const data = await fetchJson($, 'https://ipapi.co/json/')
  if (typeof data?.latitude !== 'number') throw new Error('no location in reply')
  return {
    name: [data.city, data.country_code].filter(Boolean).join(', ') || 'Here',
    lat: data.latitude,
    lon: data.longitude,
    tz: data.timezone,
    isApprox: true,
  }
}

const parseCoords = (args: string): Place | undefined => {
  const m = args.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)(?:\s+(\S+))?\s*$/)
  if (!m) return undefined
  const lat = Number(m[1])
  const lon = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return undefined
  return { name: `${lat.toFixed(2)}, ${lon.toFixed(2)}`, lat, lon, tz: m[3] }
}

const HINT = 'Set it with /sun <city> or /sun <lat>,<lon> [Area/City]'

async function show($: EngineInterface): Promise<Place | undefined> {
  const place = (await $.store.get(KEY)) as Place | undefined
  $.ui.status(place ? describe(await $.clock.now(), place) : `☀ Sun times: no location. ${HINT}`)
  return place
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sun',
      description: 'Sunrise and sunset: /sun, /sun <city>, /sun <lat>,<lon> [tz], /sun auto',
    })

    if (!(await $.store.get(KEY))) {
      try {
        await $.store.set(KEY, await fromIp($))
      } catch {}
    }
    await show($)
    // Keep the line current across midnight.
    $.clock.every(5 * 60 * 1000, () => void show($))

    return next(e)
  })

  on('command.run', { command: 'sun' }, async ($, e) => {
    const args = e.args.trim()

    if (args) {
      let place: Place | undefined
      try {
        place = args === 'auto' ? await fromIp($) : (parseCoords(args) ?? (await geocode($, args)))
      } catch (err) {
        return { text: `Couldn't look up "${args}" (${String(err)}). Try /sun <lat>,<lon> [Area/City].` }
      }
      if (!place) return { text: `No place found for "${args}". ${HINT}` }
      await $.store.set(KEY, place)
    }

    const place = await show($)
    if (!place) return { text: `No location set. ${HINT}` }

    return { text: describe(await $.clock.now(), place) }
  })
}
