"use client"

import { useState } from "react"
import { ChevronDown, MapPin, Info, X } from "lucide-react"
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import {
  type Beach,
  type ScoreKey,
  SCORE_LABELS,
  SCORE_ORDER,
  SCORE_TIERS,
  scoreBgClass,
  scoreColorClass,
  scoreTierLabel,
} from "@/lib/scoring"
import { BeachWeatherPanel } from "@/components/beach-weather"
import { cn } from "@/lib/utils"

type Props = {
  beach: Beach | null
  onClose: () => void
}

export function BeachSheet({ beach, onClose }: Props) {
  return (
    <Drawer open={Boolean(beach)} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="mx-auto max-h-[85dvh] max-w-lg rounded-t-3xl bg-card pb-[env(safe-area-inset-bottom)]">
        {beach && <SheetBody beach={beach} onClose={onClose} />}
      </DrawerContent>
    </Drawer>
  )
}

function SheetBody({ beach, onClose }: { beach: Beach; onClose: () => void }) {
  return (
    <div className="overflow-y-auto overscroll-contain px-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <DrawerTitle className="text-balance text-xl font-bold leading-tight">{beach.name}</DrawerTitle>
          <DrawerDescription className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            {beach.nearPlace ? `Zona ${beach.nearPlace}` : "Isola d'Elba"}
            {beach.surfaceLabel ? ` · Fondo: ${beach.surfaceLabel}` : ""}
          </DrawerDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-secondary"
          aria-label="Chiudi dettaglio spiaggia"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Quick facts derived from OSM geometry */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {beach.lengthM != null && beach.lengthM > 0 && (
          <Fact>{beach.lengthM >= 1000 ? `${(beach.lengthM / 1000).toFixed(1)} km` : `${beach.lengthM} m`} di costa</Fact>
        )}
        <Fact>Esposta a {beach.exposure.label}</Fact>
        {beach.meta.parkingDist != null && <Fact>Parcheggio a {formatDist(beach.meta.parkingDist)}</Fact>}
        {beach.meta.resortsNear > 0 && <Fact>{beach.meta.resortsNear} stabilimenti</Fact>}
        {beach.meta.foodNear > 0 && <Fact>{beach.meta.foodNear} bar/ristoranti</Fact>}
      </div>

      {/* Scores */}
      <div className="mt-4 flex flex-col gap-2">
        {SCORE_ORDER.map((key) => (
          <ScoreRow key={key} scoreKey={key} beach={beach} />
        ))}
      </div>

      {/* Tier legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl bg-muted/60 px-3.5 py-2.5 text-[11px] text-muted-foreground">
        {SCORE_TIERS.map((t) => (
          <span key={t.tier} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", `bg-score-${t.tier}`)} aria-hidden="true" />
            {t.range} {t.label.toLowerCase()}
          </span>
        ))}
      </div>

      {/* Weather */}
      <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Meteo e mare in tempo reale
      </h3>
      <BeachWeatherPanel
        lat={beach.lat}
        lon={beach.lon}
        exposureBearing={beach.exposure?.bearing ?? null}
      />

      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
        Dati spiaggia: © OpenStreetMap contributors · Meteo: Open-Meteo
        <br />
        Punteggi calcolati algoritmicamente da dati reali, nessun dato inventato
      </p>
    </div>
  )
}

function Fact({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
}

function ScoreRow({ scoreKey, beach }: { scoreKey: ScoreKey; beach: Beach }) {
  const [expanded, setExpanded] = useState(false)
  const score = beach.scores[scoreKey]
  const info = SCORE_LABELS[scoreKey]
  const factors = beach.factors[scoreKey]

  return (
    <div className="rounded-2xl bg-muted/70">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
        aria-label={`${info.label}: ${score} su 10. Tocca per i dettagli`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">{info.label}</span>
            <span className={cn("flex items-baseline gap-1.5 text-sm font-bold", scoreColorClass(score))}>
              <span className="text-[11px] font-semibold uppercase tracking-wide">{scoreTierLabel(score)}</span>
              <span className="tabular-nums">{score.toFixed(1)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn("h-full rounded-full transition-all duration-500", scoreBgClass(score))}
              style={{ width: `${score * 10}%` }}
            />
          </div>
        </div>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="px-4 pb-3.5">
          <p className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            {info.description}
          </p>
          <ul className="flex flex-col gap-1">
            {factors.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] leading-snug">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
