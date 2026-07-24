"use client"

import useSWR from "swr"
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudSnow,
  Wind,
  Droplets,
  Waves,
  Thermometer,
  Clock,
  AlertTriangle,
} from "lucide-react"
import { weatherLabel, uvLevel, type BeachWeather } from "@/lib/weather"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))

const ICONS: Record<string, typeof Sun> = {
  sun: Sun,
  cloud: Cloud,
  "cloud-sun": CloudSun,
  "cloud-rain": CloudRain,
  "cloud-drizzle": CloudDrizzle,
  "cloud-fog": CloudFog,
  "cloud-lightning": CloudLightning,
  "cloud-snow": CloudSnow,
}

const UV_TEXT: Record<string, string> = {
  "uv-low": "text-uv-low",
  "uv-mod": "text-uv-mod",
  "uv-high": "text-uv-high",
  "uv-vhigh": "text-uv-vhigh",
  "uv-extreme": "text-uv-extreme",
}

export function BeachWeatherPanel({ lat, lon }: { lat: number; lon: number }) {
  const { data, error, isLoading } = useSWR<BeachWeather>(
    `/api/weather?lat=${lat}&lon=${lon}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 },
  )

  if (isLoading) return <WeatherSkeleton />

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        <AlertTriangle className="size-4 shrink-0" />
        <span>Meteo momentaneamente non disponibile</span>
      </div>
    )
  }

  const { current, marine, recommendation } = data
  const wl = weatherLabel(current.weatherCode)
  const WIcon = ICONS[wl.icon] ?? Cloud
  const uv = uvLevel(current.uvIndex)

  return (
    <div className="flex flex-col gap-3">
      {/* Main weather row */}
      <div className="flex items-center justify-between rounded-2xl bg-primary p-4 text-primary-foreground">
        <div className="flex items-center gap-3">
          <WIcon className="size-9" aria-hidden="true" />
          <div>
            <p className="text-2xl font-bold leading-none">{Math.round(current.temperature)}°C</p>
            <p className="mt-1 text-sm opacity-90">{wl.label}</p>
          </div>
        </div>
        <div className="text-right text-sm opacity-90">
          <p>Percepita {Math.round(current.apparentTemperature)}°</p>
          <p>Nuvole {current.cloudCover}%</p>
        </div>
      </div>

      {/* Recommendation */}
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-2xl p-3.5 text-sm font-medium",
          recommendation.goodNow ? "bg-score-high/15 text-foreground" : "bg-score-low/15 text-foreground",
        )}
      >
        <Clock
          className={cn("mt-0.5 size-4 shrink-0", recommendation.goodNow ? "text-score-high" : "text-score-low")}
          aria-hidden="true"
        />
        <span className="text-pretty">{recommendation.reason}</span>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-2 gap-2">
        <WeatherStat
          icon={<Sun className={cn("size-4", UV_TEXT[uv.color])} aria-hidden="true" />}
          label="Indice UV"
          value={`${Math.round(current.uvIndex * 10) / 10} · ${uv.label}`}
        />
        <WeatherStat
          icon={<Wind className="size-4 text-accent" aria-hidden="true" />}
          label="Vento"
          value={`${Math.round(current.windSpeed)} km/h`}
        />
        {marine.seaTemperature != null && (
          <WeatherStat
            icon={<Thermometer className="size-4 text-accent" aria-hidden="true" />}
            label="Acqua"
            value={`${Math.round(marine.seaTemperature)}°C`}
          />
        )}
        {marine.waveHeight != null && (
          <WeatherStat
            icon={<Waves className="size-4 text-accent" aria-hidden="true" />}
            label="Onde"
            value={`${marine.waveHeight.toFixed(1)} m`}
          />
        )}
        {current.precipitation > 0 && (
          <WeatherStat
            icon={<Droplets className="size-4 text-accent" aria-hidden="true" />}
            label="Precipitazioni"
            value={`${current.precipitation} mm`}
          />
        )}
      </div>
    </div>
  )
}

function WeatherStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-muted px-3.5 py-3">
      {icon}
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

function WeatherSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Caricamento meteo">
      <div className="h-[76px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
        <div className="h-14 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  )
}
