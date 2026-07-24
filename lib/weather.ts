// Weather utilities: WMO weather code mapping (Italian) and
// "recommended until" computation from the Open-Meteo hourly forecast.

export type CurrentWeather = {
  temperature: number
  apparentTemperature: number
  weatherCode: number
  cloudCover: number
  precipitation: number
  windSpeed: number
  uvIndex: number
  isDay: boolean
}

export type MarineData = {
  waveHeight: number | null
  seaTemperature: number | null
}

export type HourlyPoint = {
  time: string // ISO local (Europe/Rome)
  temperature: number
  uvIndex: number
  precipitationProbability: number
  weatherCode: number
}

export type BeachWeather = {
  current: CurrentWeather
  marine: MarineData
  hourly: HourlyPoint[]
  sunset: string | null
  recommendation: Recommendation
}

export type Recommendation = {
  until: string | null // "18:00" local, or null = not recommended now
  reason: string
  goodNow: boolean
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
  61: { label: "Pioggia leggera", icon: "cloud-rain" },
  63: { label: "Pioggia", icon: "cloud-rain" },
  65: { label: "Pioggia forte", icon: "cloud-rain" },
  66: { label: "Pioggia gelata", icon: "cloud-rain" },
  67: { label: "Pioggia gelata forte", icon: "cloud-rain" },
  71: { label: "Neve leggera", icon: "cloud-snow" },
  73: { label: "Neve", icon: "cloud-snow" },
  75: { label: "Neve forte", icon: "cloud-snow" },
  80: { label: "Rovesci leggeri", icon: "cloud-rain" },
  81: { label: "Rovesci", icon: "cloud-rain" },
  82: { label: "Rovesci violenti", icon: "cloud-rain" },
  95: { label: "Temporale", icon: "cloud-lightning" },
  96: { label: "Temporale con grandine", icon: "cloud-lightning" },
  99: { label: "Temporale con grandine forte", icon: "cloud-lightning" },
}

export function weatherLabel(code: number) {
  return WEATHER_LABELS[code] ?? { label: "N/D", icon: "cloud" }
}

export function uvLevel(uv: number): { label: string; color: string } {
  if (uv < 3) return { label: "Basso", color: "uv-low" }
  if (uv < 6) return { label: "Moderato", color: "uv-mod" }
  if (uv < 8) return { label: "Alto", color: "uv-high" }
  if (uv < 11) return { label: "Molto alto", color: "uv-vhigh" }
  return { label: "Estremo", color: "uv-extreme" }
}

const RAINY_CODES = new Set([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])

function isHourGood(h: HourlyPoint): { good: boolean; reason?: string } {
  if (RAINY_CODES.has(h.weatherCode)) return { good: false, reason: "in arrivo pioggia" }
  if (h.precipitationProbability > 40) return { good: false, reason: `probabilità pioggia ${h.precipitationProbability}%` }
  if (h.temperature < 18) return { good: false, reason: "temperatura in calo sotto i 18°C" }
  return { good: true }
}

/**
 * Scans hourly forecast from now onward and finds the last consecutive "good"
 * beach hour (no rain, warm enough) capped at sunset.
 */
export function computeRecommendation(hourly: HourlyPoint[], sunset: string | null, now: Date): Recommendation {
  // Only future/current hours
  const upcoming = hourly.filter((h) => new Date(h.time).getTime() >= now.getTime() - 30 * 60 * 1000)
  if (upcoming.length === 0) {
    return { until: null, reason: "Nessun dato orario disponibile", goodNow: false }
  }

  const sunsetTime = sunset ? new Date(sunset) : null
  const first = isHourGood(upcoming[0])
  if (!first.good) {
    return { until: null, reason: `Sconsigliata ora: ${first.reason}`, goodNow: false }
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
    const check = isHourGood(h)
    if (!check.good) {
      stopReason = check.reason ?? ""
      break
    }
    lastGood = h
  }

  const end = sunsetTime && new Date(lastGood.time).getTime() >= sunsetTime.getTime() - 3600000 && stopReason === "tramonto"
    ? sunsetTime
    : new Date(lastGood.time)

  const hh = end.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
  const reason =
    stopReason === "tramonto"
      ? `Consigliata fino alle ${hh} (tramonto)`
      : stopReason
        ? `Consigliata fino alle ${hh} — poi ${stopReason}`
        : `Consigliata fino alle ${hh}`

  return { until: hh, reason, goodNow: true }
}
