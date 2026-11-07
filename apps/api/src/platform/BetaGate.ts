import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { BetaSettings } from "./Bindings.ts"

/*
 * Whether an address may create an account while Insyte is invite-only (M2.2): the stage may turn the gate off or admit
 * whole domains (`example.com` off production, for the tests); otherwise the address, or its `@domain`, must be in
 * `beta_allowlist`. An open invitation admits an address too, once invitations exist (step 3).
 */
export const admitted = Effect.fn("BetaGate.admitted")(function*(email: string) {
  const settings = yield* BetaSettings
  if (!settings.gate) return true
  const address = email.trim().toLowerCase()
  const domain = address.slice(address.lastIndexOf("@") + 1)
  if (settings.domains.includes(domain)) return true
  const db = yield* Db
  const rows = yield* db.routing((sql) =>
    sql<{ readonly entry: string }>`select entry from beta_allowlist where entry in (${address}, ${`@${domain}`})`
  )
  return rows.length > 0
})
