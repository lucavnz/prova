// Weather utilities: WMO code mapping (Italian), UV scale, sea-state scale,
// wind-exposure logic and the "recommended until" computation, all driven by
// the Open-Meteo forecast + marine models.

export type CurrentWeather = {
  temperature: number
  apparentTemperature: number
  weatherCode: number
  cloudCover: number
  precipitation: number
  humidity: number | null
  windSpeed: number
  windGusts: number | null
  windDirection: number | null
  uvIndex: number
  isDay: boolean
}

export type MarineData = {
  waveHeight: number | null
  wavePeriod: number | null
  waveDirection: number | null
  seaTemperature: number | null
  /** true when the marine model has no sea cell near the requested point */
  available: boolean
}

export type HourlyPoint = {
  time: string // ISO local (Europe/Rome)
  temperature: number
  uvIndex: number
  precipitationProbability: number
  windSpeed: number
  weatherCode: number
}

export type UvWindow = {
  /** Local "HH:MM" when UV first reaches 6+ today, if it does */
  highFrom: string | null
  /** Local "HH:MM" when UV drops back below 6 */
  highUntil: string | null
  peak: number
  peakAt: string | null
}

export type BeachWeather = {
  current: CurrentWeather
  marine: MarineData
  hourly: HourlyPoint[]
  sunset: string | null
  sunrise: string | null
  uvWindow: UvWindow
  recommendation: Recommendation
  /** Wind exposure relative to the beach orientation, when known */
  exposure: ExposureInfo | null
  updatedAt: string
}

export type ExposureInfo = {
  /** Bearing the beach faces (degrees, 0 = north) */
  beachBearing: number
  /** "onshore" = wind blows from the sea onto the beach (choppier water) */
  relation: "onshore" | "offshore" | "cross"
  label: string
  detail: string
}

export type Recommendation = {
  until: string | null // "18:00" local, or null = not recommended now
  reason: string
  goodNow: boolean
  /** Short tag shown on the badge, e.g. "Ottima ora" */
  headline: string
}

export const WEATHER_LABELS: Record<number, { label: string; icon: string }> = {
  0: { label: "Sereno", icon: "sun" },
  1: { label: "Prevalentemente sereno", icon: "sun" },
  2: { label: "Parzialmente nuvoloso", icon: "cloud-sun" },
  3: { label: "Coperto", icon: "cloud" },
  45: { label: "Nebbia", icon: "cloud-fog" },
  48: { label: "Nebbia con brina", icon: "cloud-fog" },
  51: { label: "Pioviggine leggera", icon: "cloud-drizzle" },
  53: { label: "Pioviggine", icon: "cloud-drizzle" },
  55: { label: "Pioviggine intensa", icon: "cloud-drizzle" },
  56: { label: "Pioviggine gelata", icon: "cloud-drizzle" },
  57: { label: "Pioviggine gelata intensa", icon: "cloud-drizzle" },
  61: { label: "Pioggia leggera", icon: "cloud-rain" },
  63: { label: "Pioggia", icon: "cloud-rain" },
  65: { label: "Pioggia forte", icon: "cloud-rain" },
  66: { label: "Pioggia gelata", icon: "cloud-rain" },
  67: { label: "Pioggia gelata forte", icon: "cloud-rain" },
  71: { label: "Neve leggera", icon: "cloud-snow" },
  73: { label: "Neve", icon: "cloud-snow" },
  75: { label: "Neve forte", icon: "cloud-snow" },
  77: { label: "Granuli di neve", icon: "cloud-snow" },
  80: { label: "Rovesci leggeri", icon: "cloud-rain" },
  81: { label: "Rovesci", icon: "cloud-rain" },
  82: { label: "Rovesci violenti", icon: "cloud-rain" },
  85: { label: "Rovesci di neve", icon: "cloud-snow" },
  86: { label: "Rovesci di neve forti", icon: "cloud-snow" },
  95: { label: "Temporale", icon: "cloud-lightning" },
  96: { label: "Temporale con grandine", icon: "cloud-lightning" },
  99: { label: "Temporale con grandine forte", icon: "cloud-lightning" },
}

export function weatherLabel(code: number) {
  return WEATHER_LABELS[code] ?? { label: "N/D", icon: "cloud" }
}

/** Official WHO/WMO UV index bands */
export function uvLevel(uv: number): { label: string; color: string; advice: string } {
  if (uv < 3) return { label: "Basso", color: "uv-low", advice: "Nessuna protezione necessaria" }
  if (uv < 6) return { label: "Moderato", color: "uv-mod", advice: "Crema SPF 30 e occhiali da sole" }
  if (uv < 8) return { label: "Alto", color: "uv-high", advice: "SPF 50, cappello e ombra a mezzogiorno" }
  if (uv < 11)
    return { label: "Molto alto", color: "uv-vhigh", advice: "Evita il sole dalle 11 alle 16, SPF 50+" }
  return { label: "Estremo", color: "uv-extreme", advice: "Resta all'ombra: rischio di ustione in pochi minuti" }
}

/** Douglas-like sea state simplified for swimmers, from significant wave height */
export function seaState(waveHeight: number): { label: string; swim: string; tier: "calm" | "light" | "moderate" | "rough" } {
  if (waveHeight < 0.2) return { label: "Mare calmo", swim: "Acqua piatta, ideale per nuotare", tier: "calm" }
  if (waveHeight < 0.5) return { label: "Quasi calmo", swim: "Piccole onde, nuoto tranquillo", tier: "light" }
  if (waveHeight < 1) return { label: "Poco mosso", swim: "Onde percettibili, attenzione con i bambini", tier: "moderate" }
  if (waveHeight < 1.5) return { label: "Mosso", swim: "Onde marcate, nuoto faticoso", tier: "moderate" }
  if (waveHeight < 2.5) return { label: "Molto mosso", swim: "Bagno sconsigliato", tier: "rough" }
  return { label: "Agitato", swim: "Non entrare in acqua", tier: "rough" }
}

/** Beaufort-ish wind description tuned for umbrellas on the sand */
export function windLevel(kmh: number): { label: string; tier: "calm" | "breeze" | "windy" | "strong" } {
  if (kmh < 8) return { label: "Assente", tier: "calm" }
  if (kmh < 20) return { label: "Brezza", tier: "breeze" }
  if (kmh < 35) return { label: "Ventoso", tier: "windy" }
  return { label: "Vento forte", tier: "strong" }
}

const COMPASS_NAMES = [
  "nord",
  "nord-nord-est",
  "nord-est",
  "est-nord-est",
  "est",
  "est-sud-est",
  "sud-est",
  "sud-sud-est",
  "sud",
  "sud-sud-ovest",
  "sud-ovest",
  "ovest-sud-ovest",
  "ovest",
  "ovest-nord-ovest",
  "nord-ovest",
  "nord-nord-ovest",
]

export function compassName(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  return COMPASS_NAMES[idx]
}

export function compassShort(deg: number): string {
  const short = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"]
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  return short[idx]
}

function angleDiff(a: number, b: number): number {
  return Math.abs((((a - b + 540) % 360) - 180))
}

/**
 * Compares the direction the beach faces (seaward bearing, from the OSM
 * coastline) with the direction the wind is coming FROM.
 * Wind coming from the sea sector = onshore = choppier water on that beach.
 */
export function computeExposure(
  beachBearing: number,
  windFrom: number | null,
  windSpeed: number,
): ExposureInfo | null {
  if (windFrom == null) return null
  const diff = angleDiff(beachBearing, windFrom)
  const windName = compassName(windFrom)
  const strong = windSpeed >= 18

  if (diff <= 60) {
    return {
      beachBearing,
      relation: "onshore",
      label: "Vento dal mare",
      detail: strong
        ? `Vento da ${windName} (${Math.round(windSpeed)} km/h) soffia dal mare verso questa spiaggia: onde e acqua più mossa del previsto`
        : `Vento da ${windName} in arrivo dal mare: possibile leggera onda a riva`,
    }
  }
  if (diff >= 120) {
    return {
      beachBearing,
      relation: "offshore",
      label: "Spiaggia riparata",
      detail: `Vento da ${windName} soffia da terra: questa spiaggia è sottovento, acqua più calma della media dell'isola`,
    }
  }
  return {
    beachBearing,
    relation: "cross",
    label: "Vento laterale",
    detail: `Vento da ${windName} di traverso alla costa: condizioni intermedie`,
  }
}

const RAINY_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
const STORM_CODES = new Set([95, 96, 99])

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
}

/** Finds today's high-UV window (UV >= 6) and the daily peak. */
export function computeUvWindow(hourly: HourlyPoint[], now: Date): UvWindow {
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }) // YYYY-MM-DD
  const todays = hourly.filter((h) => h.time.startsWith(today))
  if (todays.length === 0) return { highFrom: null, highUntil: null, peak: 0, peakAt: null }

  let peak = -1
  let peakAt: string | null = null
  let highFrom: string | null = null
  let highUntil: string | null = null

  for (const h of todays) {
    if (h.uvIndex > peak) {
      peak = h.uvIndex
      peakAt = fmtTime(new Date(h.time))
    }
    if (h.uvIndex >= 6) {
      if (!highFrom) highFrom = fmtTime(new Date(h.time))
      highUntil = fmtTime(new Date(new Date(h.time).getTime() + 3600000))
    }
  }
  return { highFrom, highUntil, peak: Math.round(peak * 10) / 10, peakAt }
}

function hourVerdict(h: HourlyPoint): { good: boolean; reason?: string } {
  if (STORM_CODES.has(h.weatherCode)) return { good: false, reason: "temporale in arrivo" }
  if (RAINY_CODES.has(h.weatherCode)) return { good: false, reason: "pioggia in arrivo" }
  if (h.precipitationProbability > 45)
    return { good: false, reason: `probabilità di pioggia al ${h.precipitationProbability}%` }
  if (h.windSpeed >= 40) return { good: false, reason: `vento forte (${Math.round(h.windSpeed)} km/h)` }
  if (h.temperature < 19) return { good: false, reason: `temperatura sotto i 19°C` }
  return { good: true }
}

/**
 * Scans the hourly forecast from now onward and returns the last consecutive
 * "good beach hour", capped at sunset.
 */
export function computeRecommendation(
  hourly: HourlyPoint[],
  sunset: string | null,
  now: Date,
  current?: { isDay: boolean },
): Recommendation {
  const upcoming = hourly.filter((h) => new Date(h.time).getTime() >= now.getTime() - 30 * 60 * 1000)
  if (upcoming.length === 0) {
    return { until: null, reason: "Nessun dato orario disponibile", goodNow: false, headline: "Dati non disponibili" }
  }

  const sunsetTime = sunset ? new Date(sunset) : null

  // Already dark: point at tomorrow instead of pretending it is beach time.
  if (current && !current.isDay) {
    const tomorrow = upcoming.find((h) => hourVerdict(h).good && new Date(h.time).getHours() >= 8)
    const when = tomorrow ? fmtTime(new Date(tomorrow.time)) : null
    return {
      until: null,
      goodNow: false,
      headline: "È notte",
      reason: when
        ? `Ora è buio. Prima finestra utile domani dalle ${when}`
        : "Ora è buio: nessuna finestra utile nelle prossime ore",
    }
  }

  const first = hourVerdict(upcoming[0])
  if (!first.good) {
    return {
      until: null,
      goodNow: false,
      headline: "Sconsigliata ora",
      reason: `Sconsigliata in questo momento: ${first.reason}`,
    }
  }

  let lastGood = upcoming[0]
  let stopReason = ""
  for (let i = 1; i < upcoming.length; i++) {
    const h = upcoming[i]
    const t = new Date(h.time)
    if (sunsetTime && t.getTime() > sunsetTime.getTime()) {
      stopReason = "tramonto"
      break
    }
    const verdict = hourVerdict(h)
    if (!verdict.good) {
      stopReason = verdict.reason ?? ""
      break
    }
    lastGood = h
  }

  const end = stopReason === "tramonto" && sunsetTime ? sunsetTime : new Date(lastGood.time)
  const hh = fmtTime(end)
  const hoursLeft = Math.max(0, (end.getTime() - now.getTime()) / 3600000)

  const reason =
    stopReason === "tramonto"
      ? `Consigliata fino alle ${hh}, ora del tramonto`
      : stopReason
        ? `Consigliata fino alle ${hh}, poi ${stopReason}`
        : `Consigliata fino alle ${hh}`

  const headline = hoursLeft >= 4 ? "Ottima ora" : hoursLeft >= 1.5 ? "Buona ora" : "Ultima ora utile"

  return { until: hh, reason, goodNow: true, headline }
}
