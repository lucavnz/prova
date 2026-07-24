import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { BeachDataset } from "@/lib/scoring"
import { BeachApp } from "@/components/beach-app"

function loadDataset(): BeachDataset {
  const raw = readFileSync(join(process.cwd(), "data", "beaches.json"), "utf8")
  return JSON.parse(raw) as BeachDataset
}

export default function Page() {
  const dataset = loadDataset()
  return <BeachApp dataset={dataset} />
}
