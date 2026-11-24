import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { useQuery } from "../../router.tsx"
import { PRESETS } from "../../ui/period.tsx"
import type { Compare, Period } from "../../ui/period.tsx"

/*
 * The board's period in the address, so a board on a period can be linked: `?periode=deze-maand`,
 * `?periode=aangepast&van=2026-10-05&tot=2026-10-18`, and `?vergelijk=jaar` or `geen`. Without them
 * a board reads last week (16–22 nov, the week that ended yesterday) against the week before.
 */

/** Today in the demo, at midnight: what the presets count from. */
export const TODAY_DATE = new Date(DEMO_NOW.date.getFullYear(), DEMO_NOW.date.getMonth(), DEMO_NOW.date.getDate())

const DEFAULT_PRESET = "vorige-week"
const COMPARES: ReadonlyArray<Compare> = ["periode", "jaar", "geen"]

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function parse(value: string | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  if (m === null) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) || d > TODAY_DATE ? null : d
}

export function usePeriod(): Period {
  const preset = useQuery("periode") ?? DEFAULT_PRESET
  const from = parse(useQuery("van"))
  const to = parse(useQuery("tot"))
  const raw = useQuery("vergelijk")
  const compare = COMPARES.find((c) => c === raw) ?? "periode"
  if (preset === "aangepast" && from !== null && to !== null) {
    return { preset, range: from <= to ? { from, to } : { from: to, to: from }, compare }
  }
  const known = PRESETS.find((p) => p.id === preset) ?? PRESETS.find((p) => p.id === DEFAULT_PRESET)
  return {
    preset: known?.id ?? DEFAULT_PRESET,
    range: known?.range(TODAY_DATE) ?? { from: TODAY_DATE, to: TODAY_DATE },
    compare
  }
}

/** The query that holds a period; the default leaves the address clean. */
export function periodQuery(p: Period): Readonly<Record<string, string | null>> {
  const custom = !PRESETS.some((x) => x.id === p.preset)
  return {
    periode: !custom && p.preset === DEFAULT_PRESET ? null : custom ? "aangepast" : p.preset,
    van: custom ? iso(p.range.from) : null,
    tot: custom ? iso(p.range.to) : null,
    vergelijk: p.compare === "periode" ? null : p.compare,
    uitleg: null,
    dag: null
  }
}
