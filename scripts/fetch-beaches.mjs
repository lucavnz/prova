// Fetches all Elba island beaches + amenities + road network from OpenStreetMap
// (Overpass API), computes transparent 0-10 scores, and writes data/beaches.json.
// Re-run anytime to refresh the snapshot: node scripts/fetch-beaches.mjs

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, "..", "data", "beaches.json")

const BBOX = "42.70,10.05,42.88,10.45" // Isola d'Elba
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
]

async function overpass(query) {
  let lastErr
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "ElbaBeachApp/1.0 (data snapshot script)",
        },
        body: "data=" + encodeURIComponent(query),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
      return await res.json()
    } catch (e) {
      lastErr = e
      console.log(`[v0] Overpass failed on ${url}: ${e.message}, trying next...`)
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  throw lastErr
}

function centerOf(el) {
  if (el.center) return { lat: el.center.lat, lon: el.center.lon }
  return { lat: el.lat, lon: el.lon }
}

// Haversine distance in meters
function dist(a, b) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const la1 = toRad(a.lat)
  const la2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function nearestDist(point, items) {
  let best = Number.POSITIVE_INFINITY
  let bestItem = null
  for (const it of items) {
    const d = dist(point, it.point)
    if (d < best) {
      best = d
      bestItem = it
    }
  }
  return { dist: best, item: bestItem }
}

function countWithin(point, items, radius) {
  return items.filter((it) => dist(point, it.point) <= radius)
}

const clamp = (v, min = 0, max = 10) => Math.max(min, Math.min(max, v))
const round1 = (v) => Math.round(v * 10) / 10

console.log("[v0] Fetching beaches from Overpass...")
const beachData = await overpass(
  `[out:json][timeout:120];(node["natural"="beach"](${BBOX});way["natural"="beach"](${BBOX});relation["natural"="beach"](${BBOX}););out tags center;`,
)
console.log(`[v0] Beaches: ${beachData.elements.length}`)

await new Promise((r) => setTimeout(r, 2000))

console.log("[v0] Fetching amenities, resorts, parking...")
const poiData = await overpass(
  `[out:json][timeout:120];(node["amenity"~"^(bar|restaurant|cafe|fast_food|toilets|drinking_water|parking)$"](${BBOX});way["amenity"="parking"](${BBOX});nwr["leisure"="beach_resort"](${BBOX});node["shop"~"^(kiosk|beach)$"](${BBOX}););out tags center;`,
)
console.log(`[v0] POIs: ${poiData.elements.length}`)

await new Promise((r) => setTimeout(r, 2000))

console.log("[v0] Fetching road network (drivable roads, sampled as node points)...")
// We fetch road geometry as skeleton points to compute distance-to-road.
const roadData = await overpass(
  `[out:json][timeout:180];way["highway"~"^(primary|secondary|tertiary|residential|unclassified|service|track)$"](${BBOX});out geom;`,
)
console.log(`[v0] Roads: ${roadData.elements.length}`)

await new Promise((r) => setTimeout(r, 2000))

console.log("[v0] Fetching footpaths/steps...")
const pathData = await overpass(
  `[out:json][timeout:180];way["highway"~"^(footway|path|steps|pedestrian)$"](${BBOX});out geom;`,
)
console.log(`[v0] Paths: ${pathData.elements.length}`)

await new Promise((r) => setTimeout(r, 2000))

console.log("[v0] Fetching buildings (for naturalness) and named places (for naming)...")
const placeData = await overpass(
  `[out:json][timeout:120];(node["place"~"^(town|village|hamlet|locality|suburb|neighbourhood)$"](${BBOX});way["building"](${BBOX}););out tags center;`,
)
const places = placeData.elements
  .filter((e) => e.tags?.place && e.tags?.name)
  .map((e) => ({ name: e.tags.name, point: centerOf(e) }))
const buildings = placeData.elements
  .filter((e) => e.tags?.building)
  .map((e) => ({ point: centerOf(e) }))
console.log(`[v0] Places: ${places.length}, buildings: ${buildings.length}`)

// ---- Build point lists ----
const pois = poiData.elements
  .filter((e) => e.tags)
  .map((e) => ({
    kind: e.tags["leisure"] === "beach_resort" ? "beach_resort" : e.tags.amenity || e.tags.shop,
    name: e.tags.name || null,
    point: centerOf(e),
  }))

// Sample road/path geometries into points (every node of the way)
function waysToPoints(data, filterFn = () => true) {
  const pts = []
  for (const w of data.elements) {
    if (!w.geometry || !filterFn(w)) continue
    // sample every 2nd node to keep it light
    for (let i = 0; i < w.geometry.length; i += 2) {
      pts.push({ point: { lat: w.geometry[i].lat, lon: w.geometry[i].lon }, tags: w.tags })
    }
  }
  return pts
}
const roadPoints = waysToPoints(roadData)
const pathPoints = waysToPoints(pathData)
const stepsPoints = waysToPoints(pathData, (w) => w.tags?.highway === "steps")
const parkings = pois.filter((p) => p.kind === "parking")
console.log(`[v0] Road points: ${roadPoints.length}, path points: ${pathPoints.length}`)

// ---- Scoring ----
const SURFACE_BEAUTY = {
  sand: 10,
  fine_gravel: 7.5,
  pebbles: 7,
  pebblestone: 7,
  shingle: 6.5,
  gravel: 6,
  stone: 4.5,
  rock: 4,
  rocky: 4,
  concrete: 2,
}

const SURFACE_LABEL = {
  sand: "sabbia",
  fine_gravel: "ghiaia fine",
  pebbles: "ciottoli",
  pebblestone: "ciottoli",
  shingle: "ghiaia e ciottoli",
  gravel: "ghiaia",
  stone: "pietre",
  rock: "roccia",
  rocky: "roccia",
  concrete: "cemento",
}

const beaches = []
let unnamedCount = 0

for (const el of beachData.elements) {
  const tags = el.tags || {}
  const point = centerOf(el)
  if (!point.lat) continue

  // Naming
  let name = tags.name || null
  const nearestPlace = nearestDist(point, places)
  if (!name) {
    unnamedCount++
    name = `Cala senza nome (${nearestPlace.item ? "vicino a " + nearestPlace.item.name : "Elba"})`
  }

  // --- Accessibility ---
  const roadD = nearestDist(point, roadPoints).dist
  const parkingD = parkings.length ? nearestDist(point, parkings).dist : Number.POSITIVE_INFINITY
  const pathD = pathPoints.length ? nearestDist(point, pathPoints).dist : Number.POSITIVE_INFINITY
  const stepsNear = stepsPoints.length ? nearestDist(point, stepsPoints).dist < 100 : false

  // Base: distance to drivable road. 0m -> 10, 1500m+ -> 1
  let access = roadD <= 50 ? 10 : roadD >= 1500 ? 1 : 10 - (9 * (roadD - 50)) / 1450
  const accessFactors = []
  accessFactors.push(`Strada carrabile a ${Math.round(roadD)} m`)
  if (parkingD <= 300) {
    access = clamp(access + 1)
    accessFactors.push(`Parcheggio a ${Math.round(parkingD)} m`)
  } else if (Number.isFinite(parkingD)) {
    accessFactors.push(`Parcheggio più vicino a ${Math.round(parkingD)} m`)
  }
  if (roadD > 200 && pathD < roadD) {
    accessFactors.push(`Raggiungibile a piedi via sentiero (~${Math.round(roadD)} m di cammino)`)
  }
  if (stepsNear) {
    access = clamp(access - 1)
    accessFactors.push("Presenza di scalinate nell'accesso")
  }
  if (tags.access === "private") {
    access = clamp(access - 3)
    accessFactors.push("Accesso segnalato come privato su OSM")
  }

  // --- Services ---
  const near = countWithin(point, pois, 400)
  const resorts = near.filter((p) => p.kind === "beach_resort")
  const food = near.filter((p) => ["bar", "restaurant", "cafe", "fast_food", "kiosk"].includes(p.kind))
  const hygiene = near.filter((p) => ["toilets", "drinking_water"].includes(p.kind))
  const parkNear = near.filter((p) => p.kind === "parking")
  const rawServices = resorts.length * 3 + food.length * 2 + hygiene.length * 1.5 + parkNear.length * 1
  // Normalize: 0 raw -> 0, 12+ raw -> 10 (log-ish curve)
  const services = clamp(Math.round(Math.min(10, Math.sqrt(rawServices) * 2.9) * 10) / 10)
  const serviceFactors = []
  if (resorts.length) serviceFactors.push(`${resorts.length} stabiliment${resorts.length === 1 ? "o" : "i"} balneari (lettini/ombrelloni) entro 400 m`)
  if (food.length) serviceFactors.push(`${food.length} tra bar/ristoranti/chioschi entro 400 m`)
  if (hygiene.length) serviceFactors.push(`${hygiene.length} tra servizi igienici/acqua potabile entro 400 m`)
  if (parkNear.length) serviceFactors.push(`${parkNear.length} parcheggi entro 400 m`)
  if (!serviceFactors.length) serviceFactors.push("Nessun servizio mappato entro 400 m")

  // --- Beauty ---
  const surface = tags.surface || null
  let beauty = SURFACE_BEAUTY[surface] ?? 5.5
  const beautyFactors = []
  beautyFactors.push(surface ? `Fondo: ${SURFACE_LABEL[surface] || surface}` : "Fondo non mappato su OSM")
  if (tags.wikipedia || tags.wikidata) {
    beauty = clamp(beauty + 1.5)
    beautyFactors.push("Notorietà: presente su Wikipedia/Wikidata")
  }
  const buildingsNear = countWithin(point, buildings, 250).length
  if (buildingsNear <= 2 && roadD > 250) {
    beauty = clamp(beauty + 1.5)
    beautyFactors.push("Contesto selvaggio: pochissimi edifici e lontana dalle strade")
  } else if (buildingsNear <= 8) {
    beauty = clamp(beauty + 0.5)
    beautyFactors.push(`Contesto naturale: ${buildingsNear} edifici entro 250 m`)
  } else {
    beautyFactors.push(`Contesto urbanizzato: ${buildingsNear} edifici entro 250 m`)
  }

  // --- Free beach suitability ---
  let free = 10 - resorts.length * 2.5
  const freeFactors = []
  if (resorts.length === 0) freeFactors.push("Nessuno stabilimento balneare mappato nelle vicinanze")
  else freeFactors.push(`${resorts.length} stabiliment${resorts.length === 1 ? "o" : "i"} balneari vicini`)
  if (tags.access === "private") {
    free -= 4
    freeFactors.push("Accesso privato segnalato")
  } else if (tags.access === "yes" || tags.access === "public") {
    free = clamp(free + 0.5)
    freeFactors.push("Accesso pubblico segnalato su OSM")
  }
  free = clamp(round1(free))

  beaches.push({
    id: `${el.type}-${el.id}`,
    name,
    named: Boolean(tags.name),
    lat: round6(point.lat),
    lon: round6(point.lon),
    surface,
    surfaceLabel: surface ? SURFACE_LABEL[surface] || surface : null,
    nearPlace: nearestPlace.item?.name || null,
    osm: { type: el.type, id: el.id, wikipedia: tags.wikipedia || null },
    scores: {
      access: round1(clamp(access)),
      beauty: round1(clamp(beauty)),
      services,
      free,
    },
    factors: {
      access: accessFactors,
      beauty: beautyFactors,
      services: serviceFactors,
      free: freeFactors,
    },
    meta: {
      roadDist: Math.round(roadD),
      parkingDist: Number.isFinite(parkingD) ? Math.round(parkingD) : null,
      resortsNear: resorts.length,
      foodNear: food.length,
    },
  })
}

function round6(v) {
  return Math.round(v * 1e6) / 1e6
}

beaches.sort((a, b) => a.name.localeCompare(b.name, "it"))

const out = {
  generatedAt: new Date().toISOString(),
  source: "OpenStreetMap (Overpass API) — © OpenStreetMap contributors, ODbL",
  bbox: BBOX,
  count: beaches.length,
  namedCount: beaches.filter((b) => b.named).length,
  beaches,
}

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify(out, null, 1))
console.log(`[v0] Wrote ${beaches.length} beaches (${out.namedCount} named, ${unnamedCount} unnamed) to ${OUT_PATH}`)
