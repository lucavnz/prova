// Shared types and labels for the beach dataset (data/beaches.json)

export type ScoreKey = "access" | "beauty" | "services" | "free"

export type Beach = {
  id: string
  name: string
  named: boolean
  lat: number
  lon: number
  surface: string | null
  surfaceLabel: string | null
  nearPlace: string | null
  osm: { type: string; id: number; wikipedia: string | null }
  scores: Record<ScoreKey, number>
  factors: Record<ScoreKey, string[]>
  meta: {
    roadDist: number
    parkingDist: number | null
    resortsNear: number
    foodNear: number
  }
}

export type BeachDataset = {
  generatedAt: string
  source: string
  count: number
  namedCount: number
  beaches: Beach[]
}

export const SCORE_LABELS: Record<ScoreKey, { label: string; short: string; description: string }> = {
  access: {
    label: "Accessibilità",
    short: "Accesso",
    description: "Quanto è facile arrivarci: distanza da strade e parcheggi, sentieri e scalinate",
  },
  beauty: {
    label: "Bellezza",
    short: "Bellezza",
    description: "Tipo di fondo, notorietà (Wikipedia) e contesto naturale dai dati OpenStreetMap",
  },
  services: {
    label: "Servizi",
    short: "Servizi",
    description: "Stabilimenti con lettini, bar, ristoranti, toilette e parcheggi entro 400 m",
  },
  free: {
    label: "Spiaggia libera",
    short: "Libera",
    description: "Quanto è adatta come spiaggia libera: pochi stabilimenti, accesso pubblico",
  },
}

export const SCORE_ORDER: ScoreKey[] = ["beauty", "access", "services", "free"]

// Maps a 0-10 score to a CSS color (green -> amber -> red)
export function scoreColor(score: number): string {
  if (score >= 7) return "var(--score-high)"
  if (score >= 4.5) return "var(--score-mid)"
  return "var(--score-low)"
}

export function scoreColorClass(score: number): string {
  if (score >= 7) return "text-score-high"
  if (score >= 4.5) return "text-score-mid"
  return "text-score-low"
}

export function scoreBgClass(score: number): string {
  if (score >= 7) return "bg-score-high"
  if (score >= 4.5) return "bg-score-mid"
  return "bg-score-low"
}
