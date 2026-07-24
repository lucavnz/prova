import {
  computeExposure,
  computeRecommendation,
  computeUvWindow,
  type BeachWeather,
  type HourlyPoint,
} from "@/lib/weather"

export const revalidate = 900 // 15 min

// Isola d'Elba bounding box guard
const BOUNDS = { minLat: 42.5, maxLat: 43.1, minLon: 9.8, maxLon: 10.7 }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = Number.parseFloat(searchParams.get("lat") ?? "")
  const lon = Number.parseFloat(searchParams.get("lon") ?? "")
  const bearingParam = Number.parseFloat(searchParams.get("bearing") ?? "")
  const beachBearing = Number.isFinite(bearingParam) ? bearingParam : null

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < BOUNDS.minLat ||
    lat > BOUNDS.maxLat ||
    lon < BOUNDS.minLon ||
    lon > BOUNDS.maxLon
  ) {
    return Response.json({ error: "Coordinate non valide" }, { status: 400 })
  }

  // Round to a ~1 km grid so neighbouring beaches share a cache entry.
  const rlat = Math.round(lat * 100) / 100
  const rlon = Math.round(lon * 100) / 100

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,cloud_cover,` +
    `precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,is_day` +
    `&hourly=temperature_2m,uv_index,precipitation_probability,wind_speed_10m,weather_code` +
    `&daily=sunrise,sunset,uv_index_max&forecast_days=2&timezone=Europe%2FRome`

  // The marine model (MFWAM) has a coarse grid; cell_selection=sea keeps us on
  // a water cell instead of snapping onto the island.
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${rlat}&longitude=${rlon}` +
    `&current=wave_height,wave_period,wave_direction,sea_surface_temperature` +
    `&cell_selection=sea&timezone=Europe%2FRome`

  try {
    const [forecastRes, marineRes] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate: 900 } }),
      fetch(marineUrl, { next: { revalidate: 900 } }).catch(() => null),
    ])

    if (!forecastRes.ok) {
      return Response.json({ error: "Servizio meteo non disponibile" }, { status: 502 })
    }

    const forecast = await forecastRes.json()
    const marine = marineRes && marineRes.ok ? await marineRes.json() : null

    const h = forecast.hourly ?? {}
    const hourly: HourlyPoint[] = (h.time ?? []).map((time: string, i: number) => ({
      time,
      temperature: h.temperature_2m?.[i] ?? 0,
      uvIndex: h.uv_index?.[i] ?? 0,
      precipitationProbability: h.precipitation_probability?.[i] ?? 0,
      windSpeed: h.wind_speed_10m?.[i] ?? 0,
      weatherCode: h.weather_code?.[i] ?? 0,
    }))

    const c = forecast.current ?? {}
    const sunset: string | null = forecast.daily?.sunset?.[0] ?? null
    const sunrise: string | null = forecast.daily?.sunrise?.[0] ?? null
    const now = new Date()

    const current = {
      temperature: c.temperature_2m,
      apparentTemperature: c.apparent_temperature,
      weatherCode: c.weather_code,
      cloudCover: c.cloud_cover,
      precipitation: c.precipitation ?? 0,
      humidity: c.relative_humidity_2m ?? null,
      windSpeed: c.wind_speed_10m ?? 0,
      windGusts: c.wind_gusts_10m ?? null,
      windDirection: c.wind_direction_10m ?? null,
      uvIndex: c.uv_index ?? 0,
      isDay: c.is_day === 1,
    }

    const mc = marine?.current ?? null
    const payload: BeachWeather = {
      current,
      marine: {
        waveHeight: mc?.wave_height ?? null,
        wavePeriod: mc?.wave_period ?? null,
        waveDirection: mc?.wave_direction ?? null,
        seaTemperature: mc?.sea_surface_temperature ?? null,
        available: mc?.wave_height != null || mc?.sea_surface_temperature != null,
      },
      hourly: hourly.slice(0, 48),
      sunset,
      sunrise,
      uvWindow: computeUvWindow(hourly, now),
      recommendation: computeRecommendation(hourly, sunset, now, current),
      exposure:
        beachBearing != null ? computeExposure(beachBearing, current.windDirection, current.windSpeed) : null,
      updatedAt: new Date().toISOString(),
    }

    return Response.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  } catch {
    return Response.json({ error: "Errore nel recupero del meteo" }, { status: 502 })
  }
}
