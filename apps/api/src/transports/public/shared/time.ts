import { Effect } from "effect"
import { validation } from "./errors.ts"

/* Times in the public shape (M19.2): epoch milliseconds out as ISO 8601, and an ISO time from a body back in. */

export const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** An ISO time from the body, or the field it came in refused. */
export const timeOf = (field: string, value: string | null | undefined) => {
  if (value === undefined || value === null) return Effect.succeed(value)
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? validation({ [field]: "invalid" }) : Effect.succeed(ms)
}
