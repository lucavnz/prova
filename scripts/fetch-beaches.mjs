// Fetches ALL Isola d'Elba beaches + amenities + roads + coastline from
// OpenStreetMap (Overpass API), computes transparent 0-10 scores and a
// representative point that actually sits ON the beach, then writes
// data/beaches.json.
//
// Re-run anytime to refresh the snapshot:  node scripts/fetch-beaches.mjs
//
// No data is invented: every score is derived from OSM tags/geometry and every
// contributing factor is recorded in `factors` so the UI can explain it.

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(__dirname, "..", "data", "beaches.json")

const BBOX = "42.68,10.03,42.90,10.47" // Isola d'Elba (+ isolotti costieri)
const ISLAND_CENTER = { lat: 42.7845, lon: 10.2385 } // baricentro approssimato dell'isola

const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
]

async function overpass(label, query, { attempts = 3 } = {}) {
  let lastErr
  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "ElbaBeachApp/1.0 (OSM data snapshot script)",
          },
          body: "data=" + encodeURIComponent(query),
        })
        const text = await res.text()
        if (!res.ok || text.trimStart().startsWith("<")) {
          throw new Error(`HTTP ${res.status} (non-JSON response)`)
        }
        const json = JSON.parse(text)
        console.log(`[v0] ${label}: ${json.elements.length} elementi (via ${new URL(url).host})`)
        return json
      } catch (e) {
        lastErr = e
        console.log(`[v0] ${label} failed on ${new URL(url).host}: ${e.message}`)
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
    const backoff = 8000 * attempt
    console.log(`[v0] ${label}: tutti i mirror hanno fallito, riprovo in ${backoff / 1000}s (tentativo ${attempt}/${attempts})`)
    await new Promise((r) => setTimeout(r, backoff))
  }
  throw lastErr
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

const R = 6371000
const toRad = (d) => (d * Math.PI) / 180
const toDeg = (r) => (r * 180) / Math.PI
const clamp = (v, min = 0, max = 10) => Math.max(min, Math.min(max, v))
const round1 = (v) => Math.round(v * 10) / 10
const round6 = (v) => Math.round(v * 1e6) / 1e6

function dist(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Local equirectangular projection (meters) around an origin — accurate enough
// at island scale and lets us do planar geometry.
function projector(origin) {
  const k = Math.cos(toRad(origin.lat))
  return {
    to: (p) => ({ x: toRad(p.lon - origin.lon) * R * k, y: toRad(p.lat - origin.lat) * R }),
    from: (p) => ({
      lat: origin.lat + toDeg(p.y / R),
      lon: origin.lon + toDeg(p.x / (R * k)),
    }),
  }
}

function bearing(from, to) {
  const y = Math.sin(toRad(to.lon - from.lon)) * Math.cos(toRad(to.lat))
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(toRad(to.lon - from.lon))
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function moveBy(point, bearingDeg, meters) {
  const k = Math.cos(toRad(point.lat))
  const dy = meters * Math.cos(toRad(bearingDeg))
  const dx = meters * Math.sin(toRad(bearingDeg))
  return { lat: point.lat + toDeg(dy / R), lon: point.lon + toDeg(dx / (R * k)) }
}

const COMPASS = [
  [0, "nord"],
  [22.5, "nord-est"],
  [67.5, "est"],
  [112.5, "sud-est"],
  [157.5, "sud"],
  [202.5, "sud-ovest"],
  [247.5, "ovest"],
  [292.5, "nord-ovest"],
  [337.5, "nord"],
]
function compassLabel(deg) {
  const d = ((deg % 360) + 360) % 360
  let label = "nord"
  for (const [start, name] of COMPASS) if (d >= start) label = name
  return label
}

function pathLength(geometry) {
  let total = 0
  for (let i = 1; i < geometry.length; i++) total += dist(geometry[i - 1], geometry[i])
  return total
}

// Point at the middle of a polyline measured along its arc length — always
// lies exactly on the line (unlike a bounding-box centre).
function midpointAlongPath(geometry) {
  const total = pathLength(geometry)
  if (total === 0) return geometry[0]
  let walked = 0
  for (let i = 1; i < geometry.length; i++) {
    const seg = dist(geometry[i - 1], geometry[i])
    if (walked + seg >= total / 2) {
      const t = seg === 0 ? 0 : (total / 2 - walked) / seg
      return {
        lat: geometry[i - 1].lat + (geometry[i].lat - geometry[i - 1].lat) * t,
        lon: geometry[i - 1].lon + (geometry[i].lon - geometry[i - 1].lon) * t,
      }
    }
    walked += seg
  }
  return geometry[geometry.length - 1]
}

function pointInRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x,
      yi = ring[i].y,
      xj = ring[j].x,
      yj = ring[j].y
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distToRing(p, ring) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < ring.length; i++) best = Math.min(best, distToSegment(p, ring[i - 1], ring[i]))
  return best
}

// "Pole of inaccessibility": the interior point farthest from the polygon edges.
// Guarantees the marker sits well inside the beach polygon, even if concave.
function poleOfInaccessibility(geometry) {
  const origin = geometry[0]
  const proj = projector(origin)
  const ring = geometry.map(proj.to)
  const xs = ring.map((p) => p.x)
  const ys = ring.map((p) => p.y)
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys)

  let best = null
  let bestScore = -1
  const STEPS = 18
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const cand = { x: minX + ((maxX - minX) * i) / STEPS, y: minY + ((maxY - minY) * j) / STEPS }
      if (!pointInRing(cand, ring)) continue
      const d = distToRing(cand, ring)
      if (d > bestScore) {
        bestScore = d
        best = cand
      }
    }
  }
  if (!best) return { point: midpointAlongPath(geometry), inset: 0 }
  return { point: proj.from(best), inset: bestScore }
}

/* ------------------------------------------------------------------ *
 * Fetch OSM data
 * ------------------------------------------------------------------ */

console.log("[v0] --- Isola d'Elba beach snapshot ---")

const beachData = await overpass(
  "Spiagge",
  `[out:json][timeout:180];
   (node["natural"="beach"](${BBOX});
    way["natural"="beach"](${BBOX});
    relation["natural"="beach"](${BBOX}););
   out tags geom;`,
)

await new Promise((r) => setTimeout(r, 2000))

const poiData = await overpass(
  "Servizi e POI",
  `[out:json][timeout:180];
   (node["amenity"~"^(bar|restaurant|cafe|fast_food|ice_cream|toilets|drinking_water|shower|parking)$"](${BBOX});
    way["amenity"="parking"](${BBOX});
    nwr["leisure"~"^(beach_resort|marina)$"](${BBOX});
    nwr["amenity"="boat_rental"](${BBOX});
    node["shop"~"^(kiosk|beach|rental)$"](${BBOX});
    nwr["tourism"~"^(hotel|camp_site|apartment)$"](${BBOX});
    node["highway"="bus_stop"](${BBOX}););
   out tags center;`,
)

await new Promise((r) => setTimeout(r, 2000))

const roadData = await overpass(
  "Strade carrabili",
  `[out:json][timeout:240];
   way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track)$"](${BBOX});
   out geom;`,
)

await new Promise((r) => setTimeout(r, 2000))

const pathData = await overpass(
  "Sentieri e scalinate",
  `[out:json][timeout:240];
   way["highway"~"^(footway|path|steps|pedestrian|cycleway|bridleway)$"](${BBOX});
   out geom;`,
)

await new Promise((r) => setTimeout(r, 2000))

const contextData = await overpass(
  "Edifici e località",
  `[out:json][timeout:180];
   (node["place"~"^(town|village|hamlet|locality|suburb|neighbourhood|isolated_dwelling)$"](${BBOX});
    way["building"](${BBOX});
    relation["building"](${BBOX}););
   out tags center;`,
)

await new Promise((r) => setTimeout(r, 2000))

const coastData = await overpass(
  "Linea di costa",
  `[out:json][timeout:240];
   way["natural"="coastline"](${BBOX});
   out geom;`,
)

await new Promise((r) => setTimeout(r, 1000))

const protectedData = await overpass(
  "Aree protette e natura",
  `[out:json][timeout:180];
   (nwr["boundary"="protected_area"](${BBOX});
    nwr["leisure"="nature_reserve"](${BBOX});
    nwr["natural"="wood"](${BBOX}););
   out tags center;`,
).catch(() => ({ elements: [] }))

/* ------------------------------------------------------------------ *
 * Prepare lookup structures
 * ------------------------------------------------------------------ */

function centerOf(el) {
  if (el.center) return { lat: el.center.lat, lon: el.center.lon }
  if (el.lat != null) return { lat: el.lat, lon: el.lon }
  if (el.geometry?.length) {
    const g = el.geometry.filter((p) => p && p.lat != null)
    if (g.length) return midpointAlongPath(g)
  }
  return null
}

const POI_GROUPS = {
  beach_resort: "resort",
  bar: "food",
  restaurant: "food",
  cafe: "food",
  fast_food: "food",
  ice_cream: "food",
  kiosk: "food",
  toilets: "hygiene",
  drinking_water: "hygiene",
  shower: "hygiene",
  parking: "parking",
  bus_stop: "transit",
  marina: "nautical",
  boat_rental: "nautical",
  rental: "nautical",
  beach: "rental",
  hotel: "lodging",
  camp_site: "lodging",
  apartment: "lodging",
}

const pois = []
for (const el of poiData.elements) {
  const tags = el.tags
  if (!tags) continue
  const point = centerOf(el)
  if (!point) continue
  const kindRaw =
    tags.leisure === "beach_resort"
      ? "beach_resort"
      : tags.leisure === "marina"
        ? "marina"
        : tags.highway === "bus_stop"
          ? "bus_stop"
          : tags.amenity || tags.shop || tags.tourism
  const group = POI_GROUPS[kindRaw]
  if (!group) continue
  pois.push({ group, kind: kindRaw, name: tags.name || null, point })
}

const places = contextData.elements
  .filter((e) => e.tags?.place && e.tags?.name)
  .map((e) => ({ name: e.tags.name, place: e.tags.place, point: centerOf(e) }))
  .filter((p) => p.point)

const buildings = contextData.elements
  .filter((e) => e.tags?.building)
  .map((e) => ({ point: centerOf(e) }))
  .filter((b) => b.point)

const protectedAreas = protectedData.elements
  .filter((e) => e.tags && (e.tags.boundary === "protected_area" || e.tags.leisure === "nature_reserve"))
  .map((e) => ({ name: e.tags.name || "Area protetta", point: centerOf(e) }))
  .filter((p) => p.point)

const woods = protectedData.elements
  .filter((e) => e.tags?.natural === "wood")
  .map((e) => ({ point: centerOf(e) }))
  .filter((w) => w.point)

// Sample way geometries into point clouds so we can measure "distance to road".
function waysToPoints(data, filterFn = () => true, stride = 1) {
  const pts = []
  for (const w of data.elements) {
    if (!w.geometry || !filterFn(w)) continue
    for (let i = 0; i < w.geometry.length; i += stride) {
      const p = w.geometry[i]
      if (p?.lat != null) pts.push({ point: p, tags: w.tags })
    }
  }
  return pts
}

const roadPoints = waysToPoints(roadData)
const majorRoadPoints = waysToPoints(roadData, (w) =>
  /^(primary|secondary|tertiary|unclassified|residential|living_street)$/.test(w.tags?.highway),
)
const pathPoints = waysToPoints(pathData)
const stepsPoints = waysToPoints(pathData, (w) => w.tags?.highway === "steps")
const parkings = pois.filter((p) => p.group === "parking")
const busStops = pois.filter((p) => p.group === "transit")

// Coastline segments, used to derive which way each beach faces.
const coastSegments = []
for (const w of coastData.elements) {
  if (!w.geometry) continue
  for (let i = 1; i < w.geometry.length; i++) {
    const a = w.geometry[i - 1]
    const b = w.geometry[i]
    if (a?.lat == null || b?.lat == null) continue
    coastSegments.push({ a, b, mid: { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 } })
  }
}

console.log(
  `[v0] Indici pronti — POI:${pois.length} strade:${roadPoints.length} sentieri:${pathPoints.length} ` +
    `edifici:${buildings.length} costa:${coastSegments.length} aree protette:${protectedAreas.length}`,
)

// Spatial grid to keep nearest-neighbour queries fast.
const CELL = 0.01 // ~1.1 km
function buildGrid(items) {
  const grid = new Map()
  for (const it of items) {
    const key = `${Math.floor(it.point.lat / CELL)}:${Math.floor(it.point.lon / CELL)}`
    if (!grid.has(key)) grid.set(key, [])
    grid.get(key).push(it)
  }
  return grid
}
function gridQuery(grid, point, rings) {
  const gi = Math.floor(point.lat / CELL)
  const gj = Math.floor(point.lon / CELL)
  const out = []
  for (let i = gi - rings; i <= gi + rings; i++) {
    for (let j = gj - rings; j <= gj + rings; j++) {
      const cell = grid.get(`${i}:${j}`)
      if (cell) out.push(...cell)
    }
  }
  return out
}

const grids = {
  road: buildGrid(roadPoints),
  majorRoad: buildGrid(majorRoadPoints),
  path: buildGrid(pathPoints),
  steps: buildGrid(stepsPoints),
  poi: buildGrid(pois),
  building: buildGrid(buildings),
  wood: buildGrid(woods),
  coast: buildGrid(coastSegments.map((s) => ({ point: s.mid, seg: s }))),
}

function nearest(grid, point, maxRings = 6) {
  for (let rings = 1; rings <= maxRings; rings++) {
    const cands = gridQuery(grid, point, rings)
    if (cands.length) {
      let best = Number.POSITIVE_INFINITY
      let bestItem = null
      for (const c of cands) {
        const d = dist(point, c.point)
        if (d < best) {
          best = d
          bestItem = c
        }
      }
      // Only trust the result if it is comfortably inside the searched radius.
      if (best <= rings * CELL * 111000 * 0.8 || rings === maxRings) return { dist: best, item: bestItem }
    }
  }
  return { dist: Number.POSITIVE_INFINITY, item: null }
}

function within(grid, point, radius) {
  const rings = Math.max(1, Math.ceil(radius / (CELL * 111000)))
  return gridQuery(grid, point, rings).filter((it) => dist(point, it.point) <= radius)
}

/* ------------------------------------------------------------------ *
 * Seaward exposure from the coastline
 * ------------------------------------------------------------------ */

function seawardBearing(point) {
  const found = nearest(grids.coast, point, 8)
  if (!found.item) {
    // Fallback: away from the island centre.
    return { bearing: Math.round(bearing(ISLAND_CENTER, point)), source: "centro isola", coastDist: null }
  }
  const { a, b } = found.item.seg
  const tangent = bearing(a, b)
  const n1 = (tangent + 90) % 360
  const n2 = (tangent + 270) % 360
  // The seaward normal is the one pointing away from the island interior.
  const inland = bearing(point, ISLAND_CENTER)
  const diff = (x) => {
    const d = Math.abs(((x - inland + 540) % 360) - 180)
    return d
  }
  const chosen = diff(n1) > diff(n2) ? n1 : n2
  return { bearing: Math.round(chosen), source: "linea di costa OSM", coastDist: Math.round(found.dist) }
}

/* ------------------------------------------------------------------ *
 * Scoring tables
 * ------------------------------------------------------------------ */

const SURFACE_BEAUTY = {
  sand: 10,
  fine_gravel: 8,
  pebbles: 7,
  pebblestone: 7,
  shingle: 6.5,
  gravel: 6,
  grass: 5,
  stone: 4.5,
  rock: 4,
  rocky: 4,
  earth: 4,
  dirt: 4,
  concrete: 2,
  paved: 2,
}

const SURFACE_LABEL = {
  sand: "sabbia",
  fine_gravel: "ghiaia fine",
  pebbles: "ciottoli",
  pebblestone: "ciottoli",
  shingle: "ghiaia e ciottoli",
  gravel: "ghiaia",
  grass: "erba",
  stone: "pietre",
  rock: "roccia",
  rocky: "roccia",
  earth: "terra",
  dirt: "terra battuta",
  concrete: "cemento",
  paved: "pavimentato",
}

/* ------------------------------------------------------------------ *
 * Build beaches
 * ------------------------------------------------------------------ */

const beaches = []
let unnamed = 0
const geometryStats = { node: 0, line: 0, polygon: 0, relation: 0 }

for (const el of beachData.elements) {
  const tags = el.tags || {}

  // ---- Representative point that really sits on the beach ----
  let point = null
  let geomKind = "node"
  let lengthM = null
  let areaish = null

  if (el.type === "node" && el.lat != null) {
    point = { lat: el.lat, lon: el.lon }
    geomKind = "node"
    geometryStats.node++
  } else if (el.geometry?.length) {
    const g = el.geometry.filter((p) => p && p.lat != null)
    if (g.length === 1) {
      point = g[0]
      geomKind = "node"
      geometryStats.node++
    } else if (g.length > 1) {
      const closed =
        g.length > 3 &&
        Math.abs(g[0].lat - g[g.length - 1].lat) < 1e-9 &&
        Math.abs(g[0].lon - g[g.length - 1].lon) < 1e-9
      if (closed) {
        const pole = poleOfInaccessibility(g)
        point = pole.point
        areaish = Math.round(pole.inset)
        geomKind = el.type === "relation" ? "relation" : "polygon"
        geometryStats[geomKind]++
      } else {
        point = midpointAlongPath(g)
        lengthM = Math.round(pathLength(g))
        geomKind = "line"
        geometryStats.line++
      }
    }
  }
  if (!point) continue

  // ---- Exposure (which way the beach faces the open sea) ----
  const exposure = seawardBearing(point)

  // A beach mapped as a line IS the shoreline, so nudge the marker a few metres
  // inland to make sure the dot renders on the sand and not in the water.
  if (geomKind === "line") {
    point = moveBy(point, (exposure.bearing + 180) % 360, 12)
  }

  point = { lat: round6(point.lat), lon: round6(point.lon) }

  // ---- Naming ----
  const nearestPlace = nearest(buildGrid(places), point, 10)
  let name = tags.name || tags["name:it"] || tags.alt_name || null
  if (!name) {
    unnamed++
    name = nearestPlace.item ? `Spiaggia senza nome (${nearestPlace.item.name})` : "Spiaggia senza nome"
  }

  /* ---------------- Accessibility ---------------- */
  const roadD = nearest(grids.road, point).dist
  const majorRoadD = nearest(grids.majorRoad, point).dist
  const parkingD = parkings.length ? nearest(buildGrid(parkings), point, 10).dist : Number.POSITIVE_INFINITY
  const pathD = nearest(grids.path, point).dist
  const stepsD = nearest(grids.steps, point).dist
  const busD = busStops.length ? nearest(buildGrid(busStops), point, 10).dist : Number.POSITIVE_INFINITY

  const accessFactors = []
  // Walking distance = distance to the nearest drivable road (as the crow flies,
  // stated explicitly so the number is honest).
  let access
  if (roadD <= 60) {
    access = 10
    accessFactors.push(`Strada carrabile a ${Math.round(roadD)} m: si arriva praticamente in spiaggia`)
  } else if (roadD >= 2000) {
    access = 0.5
    accessFactors.push(`Strada carrabile molto lontana (${(roadD / 1000).toFixed(1)} km in linea d'aria)`)
  } else {
    // 60 m -> 10, 2000 m -> 1 (smooth curve)
    access = 10 - 9 * ((roadD - 60) / 1940) ** 0.75
    accessFactors.push(`Strada carrabile a ${Math.round(roadD)} m`)
  }

  if (Number.isFinite(parkingD)) {
    if (parkingD <= 150) {
      access = clamp(access + 1.2)
      accessFactors.push(`Parcheggio a ${Math.round(parkingD)} m`)
    } else if (parkingD <= 400) {
      access = clamp(access + 0.6)
      accessFactors.push(`Parcheggio a ${Math.round(parkingD)} m`)
    } else if (parkingD <= 1200) {
      accessFactors.push(`Parcheggio più vicino a ${Math.round(parkingD)} m`)
    } else {
      access = clamp(access - 0.5)
      accessFactors.push(`Nessun parcheggio mappato entro 1,2 km`)
    }
  }

  if (roadD > 150 && pathD < roadD) {
    accessFactors.push(`Ultimo tratto a piedi su sentiero (~${Math.round(roadD)} m di cammino)`)
  }
  if (stepsD < 120) {
    access = clamp(access - 1.2)
    accessFactors.push("Scalinate lungo l'accesso")
  }
  if (busD <= 500) {
    access = clamp(access + 0.5)
    accessFactors.push(`Fermata autobus a ${Math.round(busD)} m`)
  }
  if (tags.access === "private" || tags.access === "no") {
    access = clamp(access - 4)
    accessFactors.push("Accesso segnalato come privato su OSM")
  }
  if (tags.wheelchair === "yes") {
    access = clamp(access + 0.8)
    accessFactors.push("Accessibile in carrozzina (tag OSM wheelchair=yes)")
  } else if (tags.wheelchair === "limited") {
    accessFactors.push("Accessibilità in carrozzina limitata (OSM)")
  }
  if (majorRoadD > 2500) {
    access = clamp(access - 0.5)
    accessFactors.push(`Strada principale a ${(majorRoadD / 1000).toFixed(1)} km`)
  }
  access = round1(clamp(access))

  /* ---------------- Services ---------------- */
  const near400 = within(grids.poi, point, 400)
  const near800 = within(grids.poi, point, 800)
  const g = (arr, group) => arr.filter((p) => p.group === group)
  const resorts = g(near400, "resort")
  const food400 = g(near400, "food")
  const hygiene = g(near400, "hygiene")
  const parkNear = g(near400, "parking")
  const nautical = g(near400, "nautical")
  const rental = g(near400, "rental")
  const lodging = g(near800, "lodging")

  const rawServices =
    resorts.length * 3.5 +
    food400.length * 2 +
    hygiene.length * 1.8 +
    parkNear.length * 1 +
    nautical.length * 1.2 +
    rental.length * 1.5 +
    Math.min(lodging.length, 6) * 0.4
  const services = round1(clamp(Math.min(10, Math.sqrt(rawServices) * 2.85)))

  const serviceFactors = []
  if (resorts.length)
    serviceFactors.push(
      `${resorts.length} stabiliment${resorts.length === 1 ? "o" : "i"} balneari (lettini/ombrelloni) entro 400 m`,
    )
  if (food400.length) serviceFactors.push(`${food400.length} tra bar, ristoranti e chioschi entro 400 m`)
  if (hygiene.length) serviceFactors.push(`${hygiene.length} tra bagni, docce e acqua potabile entro 400 m`)
  if (parkNear.length) serviceFactors.push(`${parkNear.length} parcheggi entro 400 m`)
  if (nautical.length) serviceFactors.push(`${nautical.length} tra noleggi barche e approdi entro 400 m`)
  if (rental.length) serviceFactors.push(`${rental.length} noleggi attrezzatura da spiaggia entro 400 m`)
  if (lodging.length) serviceFactors.push(`${lodging.length} strutture ricettive entro 800 m`)
  if (!serviceFactors.length) serviceFactors.push("Nessun servizio mappato su OSM entro 400 m: spiaggia selvaggia")

  /* ---------------- Beauty ---------------- */
  const surface = tags.surface || null
  let beauty = SURFACE_BEAUTY[surface] ?? 5.5
  const beautyFactors = []
  beautyFactors.push(
    surface ? `Fondo: ${SURFACE_LABEL[surface] || surface}` : "Fondo non mappato su OSM (punteggio neutro)",
  )

  if (tags.wikipedia || tags.wikidata) {
    beauty = clamp(beauty + 1.5)
    beautyFactors.push("Notorietà: ha una voce su Wikipedia/Wikidata")
  }

  const buildingsNear = within(grids.building, point, 250).length
  if (buildingsNear === 0) {
    beauty = clamp(beauty + 1.5)
    beautyFactors.push("Contesto totalmente naturale: nessun edificio entro 250 m")
  } else if (buildingsNear <= 5) {
    beauty = clamp(beauty + 1)
    beautyFactors.push(`Contesto naturale: solo ${buildingsNear} edifici entro 250 m`)
  } else if (buildingsNear <= 20) {
    beautyFactors.push(`Contesto abitato: ${buildingsNear} edifici entro 250 m`)
  } else {
    beauty = clamp(beauty - 1)
    beautyFactors.push(`Contesto urbanizzato: ${buildingsNear} edifici entro 250 m`)
  }

  const woodNear = within(grids.wood, point, 400).length
  if (woodNear > 0) {
    beauty = clamp(beauty + 0.5)
    beautyFactors.push("Circondata da macchia mediterranea/bosco")
  }
  const protD = protectedAreas.length
    ? nearest(buildGrid(protectedAreas), point, 12).dist
    : Number.POSITIVE_INFINITY
  if (protD <= 1500) {
    beauty = clamp(beauty + 0.7)
    beautyFactors.push("All'interno o ai margini di un'area protetta")
  }
  if (roadD > 600) {
    beauty = clamp(beauty + 0.6)
    beautyFactors.push("Difficile da raggiungere: di norma poco affollata")
  }
  if (lengthM && lengthM >= 300) {
    beauty = clamp(beauty + 0.4)
    beautyFactors.push(`Arenile ampio: circa ${lengthM} m di sviluppo costiero`)
  }
  if (g(near400, "nautical").some((p) => p.kind === "marina")) {
    beauty = clamp(beauty - 0.8)
    beautyFactors.push("Vicina a un porto/marina")
  }
  beauty = round1(clamp(beauty))

  /* ---------------- Free-beach suitability ---------------- */
  let free = 10
  const freeFactors = []
  if (resorts.length === 0) {
    freeFactors.push("Nessuno stabilimento balneare mappato nelle vicinanze")
  } else {
    const penalty = Math.min(6, resorts.length * 2.2)
    free -= penalty
    freeFactors.push(
      `${resorts.length} stabiliment${resorts.length === 1 ? "o" : "i"} balneari occupano parte dell'arenile`,
    )
    if (lengthM && lengthM >= 400) {
      free = clamp(free + 1.5)
      freeFactors.push(`Arenile lungo (~${lengthM} m): resta spazio libero oltre gli stabilimenti`)
    }
  }
  if (tags.access === "private" || tags.access === "no") {
    free -= 5
    freeFactors.push("Accesso privato: non fruibile come spiaggia libera")
  } else if (tags.access === "yes" || tags.access === "public" || tags.access === "permissive") {
    free = clamp(free + 0.5)
    freeFactors.push("Accesso pubblico confermato su OSM")
  }
  if (tags.fee === "yes") {
    free -= 3
    freeFactors.push("Ingresso a pagamento segnalato")
  }
  if (hygiene.length > 0) {
    free = clamp(free + 0.5)
    freeFactors.push("Servizi igienici pubblici raggiungibili")
  }
  if (roadD > 800 && resorts.length === 0) {
    free = clamp(free + 0.3)
    freeFactors.push("Spiaggia remota e completamente libera")
  }
  free = round1(clamp(free))

  beaches.push({
    id: `${el.type}-${el.id}`,
    name,
    named: Boolean(tags.name || tags["name:it"]),
    lat: point.lat,
    lon: point.lon,
    geomKind,
    lengthM,
    surface,
    surfaceLabel: surface ? SURFACE_LABEL[surface] || surface : null,
    nearPlace: nearestPlace.item?.name || null,
    exposure: {
      bearing: exposure.bearing,
      label: compassLabel(exposure.bearing),
      source: exposure.source,
    },
    osm: {
      type: el.type,
      id: el.id,
      wikipedia: tags.wikipedia || null,
      surfaceTagged: Boolean(surface),
    },
    scores: { access, beauty, services, free },
    factors: {
      access: accessFactors,
      beauty: beautyFactors,
      services: serviceFactors,
      free: freeFactors,
    },
    meta: {
      roadDist: Math.round(roadD),
      parkingDist: Number.isFinite(parkingD) ? Math.round(parkingD) : null,
      pathDist: Number.isFinite(pathD) ? Math.round(pathD) : null,
      busDist: Number.isFinite(busD) ? Math.round(busD) : null,
      resortsNear: resorts.length,
      foodNear: food400.length,
      hygieneNear: hygiene.length,
      buildingsNear,
      insetM: areaish,
    },
  })
}

// Deduplicate beaches whose representative points collapse onto each other
// (same OSM feature mapped twice as node + way).
const deduped = []
for (const b of beaches.sort((a, b) => (b.named ? 1 : 0) - (a.named ? 1 : 0))) {
  const twin = deduped.find(
    (o) => dist(o, b) < 45 && (o.name === b.name || !b.named || !o.named),
  )
  if (twin) continue
  deduped.push(b)
}

deduped.sort((a, b) => a.name.localeCompare(b.name, "it"))

const out = {
  generatedAt: new Date().toISOString(),
  source: "OpenStreetMap (Overpass API) — © OpenStreetMap contributors, ODbL",
  weatherSource: "Open-Meteo (previsioni ICON/ECMWF + modello marino MFWAM)",
  bbox: BBOX,
  count: deduped.length,
  namedCount: deduped.filter((b) => b.named).length,
  beaches: deduped,
}

mkdirSync(dirname(OUT_PATH), { recursive: true })
writeFileSync(OUT_PATH, JSON.stringify(out, null, 1))

console.log(`[v0] Geometrie: ${JSON.stringify(geometryStats)}`)
console.log(
  `[v0] Scritte ${deduped.length} spiagge (${out.namedCount} con nome, ${unnamed} senza nome, ` +
    `${beaches.length - deduped.length} duplicati rimossi) in ${OUT_PATH}`,
)
