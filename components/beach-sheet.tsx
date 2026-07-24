"use client"

import { useState } from "react"
import { ChevronDown, MapPin, Info, X } from "lucide-react"
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer"
import { type Beach, type ScoreKey, SCORE_LABELS, SCORE_ORDER, scoreBgClass, scoreColorClass } from "@/lib/scoring"
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

      {/* Scores */}
      <div className="mt-5 flex flex-col gap-2">
        {SCORE_ORDER.map((key) => (
          <ScoreRow key={key} scoreKey={key} beach={beach} />
        ))}
      </div>

      {/* Weather */}
      <h3 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Meteo in tempo reale
      </h3>
      <BeachWeatherPanel lat={beach.lat} lon={beach.lon} />

      <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
        Dati spiaggia: © OpenStreetMap contributors · Meteo: Open-Meteo
        <br />
        Punteggi calcolati algoritmicamente da dati reali, nessun dato inventato
      </p>
    </div>
  )
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
            <span className={cn("text-sm font-bold tabular-nums", scoreColorClass(score))}>{score.toFixed(1)}</span>
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
