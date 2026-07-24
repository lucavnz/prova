"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import { type Beach, type ScoreKey, scoreColor } from "@/lib/scoring"

const ELBA_CENTER: [number, number] = [42.78, 10.24]

type Props = {
  beaches: Beach[]
  activeScore: ScoreKey
  selectedId: string | null
  onSelect: (beach: Beach) => void
}

export default function BeachMap({ beaches, activeScore, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: ELBA_CENTER,
      zoom: 11,
      zoomControl: false,
      attributionControl: true,
      tap: true,
    } as L.MapOptions)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    L.control.zoom({ position: "bottomright" }).addTo(map)

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Render/update markers when beaches or active score changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()

    for (const beach of beaches) {
      const score = beach.scores[activeScore]
      const color = scoreColor(score)
      const isSelected = beach.id === selectedId
      const size = isSelected ? 26 : beach.named ? 20 : 15

      const icon = L.divIcon({
        className: `beach-marker${isSelected ? " selected" : ""}`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<div class="dot" style="background:${color}"></div>`,
      })

      const marker = L.marker([beach.lat, beach.lon], {
        icon,
        title: beach.name,
        keyboard: false,
      })
      marker.on("click", () => onSelectRef.current(beach))
      marker.addTo(map)
      markersRef.current.set(beach.id, marker)
    }
  }, [beaches, activeScore, selectedId])

  // Fly to selected beach
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const beach = beaches.find((b) => b.id === selectedId)
    if (beach) {
      map.flyTo([beach.lat, beach.lon], Math.max(map.getZoom(), 14), { duration: 0.6 })
    }
  }, [selectedId, beaches])

  return <div ref={containerRef} className="absolute inset-0 z-0" aria-label="Mappa delle spiagge dell'Isola d'Elba" />
}
