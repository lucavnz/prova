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
  Timer,
  Navigation,
  ShieldCheck,
  Compass,
  Sunset,
} from "lucide-react"
import {
  weatherLabel,
  uvLevel,
  seaState,
  windLevel,
  compassShort,
  compassName,
  type BeachWeather,
} from "@/lib/weather"
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

const UV_BG: Record<string, string> = {
  "uv-low": "bg-uv-low",
  "uv-mod": "bg-uv-mod",
  "uv-high": "bg-uv-high",
  "uv-vhigh": "bg-uv-vhigh",
  "uv-extreme": "bg-uv-extreme",
}

const SEA_TEXT: Record<string, string> = {
  calm: "text-score-top",
  light: "text-score-high",
  moderate: "text-score-mid",
  rough: "text-score-low",
}

const WIND_TEXT: Record<string, string> = {
  calm: "text-score-top",
  breeze: "text-score-high",
  windy: "text-score-mid",
  strong: "text-score-low",
}

type Props = {
  lat: number
  lon: number
  /** Seaward bearing of the beach, used for the wind-exposure read-out */
  exposureBearing?: number | null
}

export function BeachWeatherPanel({ lat, lon, exposureBearing }: Props) {
  const bearingParam = exposureBearing == null ? "" : `&bearing=${exposureBearing}`
  const { data, error, isLoading } = useSWR<BeachWeather>(
    `/api/weather?lat=${lat}&lon=${lon}${bearingParam}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 },
  )

  if (isLoading) return <WeatherSkeleton />

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span>Meteo momentaneamente non disponibile</span>
      </div>
    )
  }

  const { current, marine, recommendation, uvWindow, exposure, sunset } = data
  const wl = weatherLabel(current.weatherCode)
  const WIcon = ICONS[wl.icon] ?? Cloud
  const uv = uvLevel(current.uvIndex)
  const sea = marine.waveHeight != null ? seaState(marine.waveHeight) : null
  const wind = windLevel(current.windSpeed)

  return (
    <div className="flex flex-col gap-3">
      {/* Current conditions */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-primary p-4 text-primary-foreground">
        <div className="flex min-w-0 items-center gap-3">
          <WIcon className="size-9 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-2xl font-bold leading-none">{Math.round(current.temperature)}°C</p>
            <p className="mt-1 truncate text-sm opacity-90">{wl.label}</p>
          </div>
        </div>
        <div className="shrink-0 text-right text-sm opacity-90">
          <p>Percepita {Math.round(current.apparentTemperature)}°</p>
          <p>Nuvole {current.cloudCover}%</p>
          {current.humidity != null && <p>Umidità {Math.round(current.humidity)}%</p>}
        </div>
      </div>

      {/* Recommended-until banner */}
      <div
        className={cn(
          "flex items-start gap-2.5 rounded-2xl p-3.5 text-sm",
          recommendation.goodNow ? "bg-score-high/15" : "bg-score-low/15",
        )}
      >
        <Clock
          className={cn("mt-0.5 size-4 shrink-0", recommendation.goodNow ? "text-score-high" : "text-score-low")}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-semibold">{recommendation.headline}</p>
          <p className="text-pretty text-[13px] leading-snug text-muted-foreground">{recommendation.reason}</p>
        </div>
      </div>

      {/* Core metrics: UV, wind, water temp, waves */}
      <div className="grid grid-cols-2 gap-2">
        <WeatherStat
          icon={<Sun className={cn("size-4", UV_TEXT[uv.color])} aria-hidden="true" />}
          label="Indice UV"
          value={`${Math.round(current.uvIndex * 10) / 10}`}
          sub={uv.label}
        />
        <WeatherStat
          icon={<Wind className={cn("size-4", WIND_TEXT[wind.tier])} aria-hidden="true" />}
          label="Vento"
          value={`${Math.round(current.windSpeed)} km/h`}
          sub={
            current.windDirection != null
              ? `${wind.label} · da ${compassShort(current.windDirection)}`
              : wind.label
          }
        />
        <WeatherStat
          icon={<Thermometer className="size-4 text-accent" aria-hidden="true" />}
          label="Temp. acqua"
          value={marine.seaTemperature != null ? `${Math.round(marine.seaTemperature)}°C` : "N/D"}
          sub={
            marine.seaTemperature != null
              ? marine.seaTemperature >= 24
                ? "Molto piacevole"
                : marine.seaTemperature >= 21
                  ? "Piacevole"
                  : marine.seaTemperature >= 18
                    ? "Fresca"
                    : "Fredda"
              : "Modello marino non disponibile"
          }
        />
        <WeatherStat
          icon={<Waves className={cn("size-4", sea ? SEA_TEXT[sea.tier] : "text-muted-foreground")} aria-hidden="true" />}
          label="Onde"
          value={marine.waveHeight != null ? `${marine.waveHeight.toFixed(1)} m` : "N/D"}
          sub={sea ? sea.label : "Modello marino non disponibile"}
        />
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-2 gap-2">
        {current.windGusts != null && (
          <WeatherStat
            icon={<Navigation className="size-4 text-accent" aria-hidden="true" />}
            label="Raffiche"
            value={`${Math.round(current.windGusts)} km/h`}
            sub={current.windGusts >= 45 ? "Ombrellone a rischio" : "Sotto controllo"}
          />
        )}
        {marine.wavePeriod != null && (
          <WeatherStat
            icon={<Timer className="size-4 text-accent" aria-hidden="true" />}
            label="Periodo onde"
            value={`${marine.wavePeriod.toFixed(1)} s`}
            sub={marine.waveDirection != null ? `Da ${compassShort(marine.waveDirection)}` : "Intervallo tra creste"}
          />
        )}
        {current.precipitation > 0 && (
          <WeatherStat
            icon={<Droplets className="size-4 text-score-low" aria-hidden="true" />}
            label="Pioggia"
            value={`${current.precipitation} mm`}
            sub="In corso ora"
          />
        )}
        {sunset && (
          <WeatherStat
            icon={<Sunset className="size-4 text-accent" aria-hidden="true" />}
            label="Tramonto"
            value={new Date(sunset).toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Europe/Rome",
            })}
            sub="Fine giornata in spiaggia"
          />
        )}
      </div>

      {/* Swimming advice from the sea state */}
      {sea && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-3 text-[13px]">
          <Waves className={cn("mt-0.5 size-4 shrink-0", SEA_TEXT[sea.tier])} aria-hidden="true" />
          <p className="text-pretty leading-snug">
            <span className="font-semibold">{sea.label}.</span> {sea.swim}
          </p>
        </div>
      )}

      {/* Per-beach wind exposure */}
      {exposure && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-3 text-[13px]">
          {exposure.relation === "offshore" ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-score-top" aria-hidden="true" />
          ) : (
            <Compass
              className={cn(
                "mt-0.5 size-4 shrink-0",
                exposure.relation === "onshore" ? "text-score-mid" : "text-accent",
              )}
              aria-hidden="true"
            />
          )}
          <p className="text-pretty leading-snug">
            <span className="font-semibold">{exposure.label}.</span> {exposure.detail}. Spiaggia esposta a{" "}
            {compassName(exposure.beachBearing)}.
          </p>
        </div>
      )}

      {/* UV protection window */}
      <div className="rounded-2xl bg-muted px-3.5 py-3">
        <div className="flex items-start gap-2.5 text-[13px]">
          <Sun className={cn("mt-0.5 size-4 shrink-0", UV_TEXT[uv.color])} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-pretty leading-snug">
              <span className="font-semibold">UV {uv.label.toLowerCase()}.</span> {uv.advice}
            </p>
            {uvWindow.highFrom && uvWindow.highUntil ? (
              <p className="mt-1 text-muted-foreground">
                Fascia UV alta oggi: {uvWindow.highFrom}-{uvWindow.highUntil} · picco {uvWindow.peak}
                {uvWindow.peakAt ? ` alle ${uvWindow.peakAt}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Nessuna fascia UV critica oggi · picco {uvWindow.peak}
                {uvWindow.peakAt ? ` alle ${uvWindow.peakAt}` : ""}
              </p>
            )}
          </div>
        </div>
        {/* UV scale bar */}
        <div className="mt-3 flex items-center gap-1" aria-hidden="true">
          {(["uv-low", "uv-mod", "uv-high", "uv-vhigh", "uv-extreme"] as const).map((c) => (
            <span
              key={c}
              className={cn("h-1.5 flex-1 rounded-full", UV_BG[c], uv.color === c ? "opacity-100" : "opacity-25")}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function WeatherStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-muted px-3.5 py-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

function WeatherSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Caricamento meteo">
      <div className="h-[88px] animate-pulse rounded-2xl bg-muted" />
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-[62px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-[62px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-[62px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-[62px] animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="h-14 animate-pulse rounded-2xl bg-muted" />
    </div>
  )
}
