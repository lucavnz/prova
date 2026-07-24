// Shared types and labels for the beach dataset (data/beaches.json)

export type ScoreKey = "access" | "beauty" | "services" | "free"

export type Beach = {
  id: string
  name: string
  named: boolean
  lat: number
  lon: number
  /** How the beach is mapped in OSM: single node, shoreline line, or polygon */
  geomKind: "node" | "line" | "polygon" | "relation"
  /** Length of the shoreline in metres, when the beach is mapped as a line */
  lengthM: number | null
  surface: string | null
  surfaceLabel: string | null
  nearPlace: string | null
  /** Direction the beach faces the open sea, derived from the OSM coastline */
  exposure: { bearing: number; label: string; source: string }
  osm: { type: string; id: number; wikipedia: string | null; surfaceTagged: boolean }
  scores: Record<ScoreKey, number>
  factors: Record<ScoreKey, string[]>
  meta: {
    roadDist: number
    parkingDist: number | null
    pathDist: number | null
    busDist: number | null
    resortsNear: number
    foodNear: number
    hygieneNear: number
    buildingsNear: number
    insetM: number | null
  }
}

export type BeachDataset = {
  generatedAt: string
  source: string
  weatherSource?: string
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

/**
 * Four score tiers, based on the score rounded to the nearest integer:
 *   0-3  rosso    (scarso)
 *   4-6  giallo   (medio)
 *   7-8  verde    (buono)
 *   9-10 azzurro  (eccellente)
 */
export type ScoreTier = "low" | "mid" | "high" | "top"

export const SCORE_TIERS: { tier: ScoreTier; label: string; range: string }[] = [
  { tier: "low", label: "Scarso", range: "0-3" },
  { tier: "mid", label: "Medio", range: "4-6" },
  { tier: "high", label: "Buono", range: "7-8" },
  { tier: "top", label: "Eccellente", range: "9-10" },
]

export function scoreTier(score: number): ScoreTier {
  const s = Math.round(score)
  if (s <= 3) return "low"
  if (s <= 6) return "mid"
  if (s <= 8) return "high"
  return "top"
}

export function scoreColor(score: number): string {
  return `var(--score-${scoreTier(score)})`
}

export function tierColor(tier: ScoreTier): string {
  return `var(--score-${tier})`
}

export function scoreColorClass(score: number): string {
  return `text-score-${scoreTier(score)}`
}

export function scoreBgClass(score: number): string {
  return `bg-score-${scoreTier(score)}`
}

export function scoreTierLabel(score: number): string {
  const tier = scoreTier(score)
  return SCORE_TIERS.find((t) => t.tier === tier)?.label ?? ""
}
