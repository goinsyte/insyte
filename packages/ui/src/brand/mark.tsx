/* The single mark used throughout the chrome — topbar, lockups, app icon.
   Points at MarkDrift (the recommended favorite from /brand/logos). */

import { InsyteWordmark, MarkDrift } from "./marks.tsx"

export function InsyteMark({
  size = 28,
  tone = "brand"
}: {
  size?: number
  tone?: "brand" | "ink" | "white" | "mono"
  className?: string
}) {
  return <MarkDrift size={size} tone={tone} />
}

export { InsyteWordmark }
