import { computeRecommendation, type BeachWeather, type HourlyPoint } from "@/lib/weather"

export const revalidate = 900 // cache 15 min per URL (lat/lon rounded)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = Number.parseFloat(searchParams.get("lat") ?? "")
  const lon = Number.parseFloat(searchParams.get("lon") ?? "")

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 42 || lat > 43.5 || lon < 9.5 || lon > 11) {
    return Response.json({ error: "Coordinate non valide" }, { status: 400 })
  }

  // Round to ~1km grid so nearby beaches share the cache entry
  const rlat = Math.round(lat * 100) / 100
  const rlon = Math.round(lon * 100) / 100

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlon}` +
    `&current=temperature_2m,apparent_temperature,weather_code,cloud_cover,precipitation,wind_speed_10m,uv_index,is_day` +
    `&hourly=temperature_2m,uv_index,precipitation_probability,weather_code` +
    `&daily=sunset&forecast_days=2&timezone=Europe%2FRome`

  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${rlat}&longitude=${rlon}` +
    `&current=wave_height,sea_surface_temperature&timezone=Europe%2FRome`

  try {
    const [forecastRes, marineRes] = await Promise.all([
      fetch(forecastUrl, { next: { revalidate: 900 } }),
      fetch(marineUrl, { next: { revalidate: 900 } }),
    ])

    if (!forecastRes.ok) {
      return Response.json({ error: "Servizio meteo non disponibile" }, { status: 502 })
    }

    const forecast = await forecastRes.json()
    const marine = marineRes.ok ? await marineRes.json() : null

    const hourly: HourlyPoint[] = (forecast.hourly?.time ?? []).map((time: string, i: number) => ({
      time,
      temperature: forecast.hourly.temperature_2m[i],
      uvIndex: forecast.hourly.uv_index[i],
      precipitationProbability: forecast.hourly.precipitation_probability[i],
      weatherCode: forecast.hourly.weather_code[i],
    }))

    const sunset: string | null = forecast.daily?.sunset?.[0] ?? null
    const now = new Date()

    const payload: BeachWeather = {
      current: {
        temperature: forecast.current.temperature_2m,
        apparentTemperature: forecast.current.apparent_temperature,
        weatherCode: forecast.current.weather_code,
        cloudCover: forecast.current.cloud_cover,
        precipitation: forecast.current.precipitation,
        windSpeed: forecast.current.wind_speed_10m,
        uvIndex: forecast.current.uv_index,
        isDay: forecast.current.is_day === 1,
      },
      marine: {
        waveHeight: marine?.current?.wave_height ?? null,
        seaTemperature: marine?.current?.sea_surface_temperature ?? null,
      },
      hourly: hourly.slice(0, 48),
      sunset,
      recommendation: computeRecommendation(hourly, sunset, now),
    }

    return Response.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    })
  } catch {
    return Response.json({ error: "Errore nel recupero del meteo" }, { status: 502 })
  }
}
