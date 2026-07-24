"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Search, List, Map as MapIcon, Waves, X } from "lucide-react"
import { type Beach, type BeachDataset, type ScoreKey, SCORE_LABELS, SCORE_ORDER } from "@/lib/scoring"
import { BeachSheet } from "@/components/beach-sheet"
import { BeachList } from "@/components/beach-list"
import { cn } from "@/lib/utils"

const BeachMap = dynamic(() => import("@/components/beach-map"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-muted">
      <p className="animate-pulse text-sm text-muted-foreground">Caricamento mappa...</p>
    </div>
  ),
})

export function BeachApp({ dataset }: { dataset: BeachDataset }) {
  const [activeScore, setActiveScore] = useState<ScoreKey>("beauty")
  const [view, setView] = useState<"map" | "list">("map")
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<Beach | null>(null)

  const filtered = useMemo(() => {
    if (!query.trim()) return dataset.beaches
    const q = query.trim().toLowerCase()
    return dataset.beaches.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.nearPlace ?? "").toLowerCase().includes(q),
    )
  }, [dataset.beaches, query])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      {/* Map layer */}
      {view === "map" && (
        <BeachMap
          beaches={filtered}
          activeScore={activeScore}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
        />
      )}

      {/* List layer */}
      {view === "list" && (
        <div className="absolute inset-0 overflow-y-auto overscroll-contain pt-[calc(env(safe-area-inset-top)+108px)]">
          <BeachList beaches={filtered} activeScore={activeScore} onSelect={setSelected} />
        </div>
      )}

      {/* Top overlay: header + filters */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-[calc(env(safe-area-inset-top)+10px)]">
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Brand / search pill */}
          <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-border/60 bg-card/85 px-3.5 shadow-lg backdrop-blur-xl">
            {searchOpen ? (
              <>
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cerca spiaggia o località..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  aria-label="Cerca una spiaggia"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false)
                    setQuery("")
                  }}
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                  aria-label="Chiudi ricerca"
                >
                  <X className="size-4" />
                </button>
              </>
            ) : (
              <>
                <Waves className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-sm font-bold leading-none">Spiagge Elba</h1>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {dataset.count} spiagge · dati reali OSM
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
                  aria-label="Cerca una spiaggia"
                >
                  <Search className="size-4" />
                </button>
              </>
            )}
          </div>

          {/* View toggle */}
          <button
            type="button"
            onClick={() => setView((v) => (v === "map" ? "list" : "map"))}
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60 bg-card/85 text-foreground shadow-lg backdrop-blur-xl transition-transform active:scale-95"
            aria-label={view === "map" ? "Passa alla vista lista" : "Passa alla vista mappa"}
          >
            {view === "map" ? <List className="size-5" /> : <MapIcon className="size-5" />}
          </button>
        </div>

        {/* Score filter chips */}
        <div className="pointer-events-auto no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Filtra per punteggio">
          {SCORE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeScore === key}
              onClick={() => setActiveScore(key)}
              className={cn(
                "h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold shadow-md backdrop-blur-xl transition-all active:scale-95",
                activeScore === key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/60 bg-card/85 text-foreground",
              )}
            >
              {SCORE_LABELS[key].label}
            </button>
          ))}
        </div>
      </header>

      {/* Legend (map view only) */}
      {view === "map" && (
        <div className="pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+14px)] left-3 z-10 flex items-center gap-2 rounded-full border border-border/60 bg-card/85 px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-xl">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-score-low" aria-hidden="true" /> 0
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-score-mid" aria-hidden="true" /> 5
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-score-high" aria-hidden="true" /> 10
          </span>
          <span className="text-muted-foreground">{SCORE_LABELS[activeScore].short}</span>
        </div>
      )}

      {/* Beach detail sheet */}
      <BeachSheet beach={selected} onClose={() => setSelected(null)} />
    </main>
  )
}
