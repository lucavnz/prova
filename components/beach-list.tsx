"use client"

import { MapPin, ChevronRight } from "lucide-react"
import {
  type Beach,
  type ScoreKey,
  SCORE_LABELS,
  scoreColorClass,
  scoreBgClass,
  scoreTier,
  scoreTierLabel,
} from "@/lib/scoring"
import { cn } from "@/lib/utils"

type Props = {
  beaches: Beach[]
  activeScore: ScoreKey
  onSelect: (beach: Beach) => void
}

export function BeachList({ beaches, activeScore, onSelect }: Props) {
  const sorted = [...beaches].sort((a, b) => b.scores[activeScore] - a.scores[activeScore])

  return (
    <div className="flex flex-col gap-2 px-4 pb-32 pt-2">
      <p className="px-1 text-xs text-muted-foreground">
        {sorted.length} spiagge · ordinate per {SCORE_LABELS[activeScore].label.toLowerCase()}
      </p>
      {sorted.map((beach, i) => {
        const score = beach.scores[activeScore]
        return (
          <button
            key={beach.id}
            type="button"
            onClick={() => onSelect(beach)}
            className="flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-left shadow-sm transition-transform active:scale-[0.98]"
          >
            <span
              className={cn(
                "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold",
                scoreBgClass(score),
                scoreTier(score) === "mid" ? "text-background" : "text-primary-foreground",
              )}
              aria-label={`${SCORE_LABELS[activeScore].label}: ${score.toFixed(1)} su 10, ${scoreTierLabel(score).toLowerCase()}`}
            >
              {score.toFixed(1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {i < 3 && <span className={cn("mr-1", scoreColorClass(score))}>#{i + 1}</span>}
                {beach.name}
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                {beach.nearPlace ?? "Isola d'Elba"}
                {beach.surfaceLabel ? ` · ${beach.surfaceLabel}` : ""}
              </p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
