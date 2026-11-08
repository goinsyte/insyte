import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { route } from "@insyte/modules/members/use-cases/invitations/route"
import { Effect } from "effect"
import { BetaSettings } from "./Bindings.ts"

/*
 * Whether an address may create an account while Insyte is invite-only (M2.2): the stage may turn the gate off or admit
 * whole domains (`example.com` off production, for the tests); otherwise the address, or its `@domain`, must be in
 * `beta_allowlist`, or hold an open invitation (an invitation is a beta pass, domain.md §2.11).
 */
export const admitted = Effect.fn("BetaGate.admitted")(function*(email: string) {
  const settings = yield* BetaSettings
  if (!settings.gate) return true
  const address = email.trim().toLowerCase()
  const domain = address.slice(address.lastIndexOf("@") + 1)
  if (settings.domains.includes(domain)) return true
  const db = yield* Db
  const rows = yield* db.routing((sql) =>
    sql<{ readonly listed: boolean; readonly invited: boolean }>`
      select exists (select 1 from beta_allowlist where entry in (${address}, ${`@${domain}`})) as listed,
             invitation_open_for(${address}) as invited`
  )
  return rows[0]?.listed === true || rows[0]?.invited === true
})

/**
 * Whether a sign-up's `x-insyte-invitation` (`<id>.<secret>`) is an open invitation for exactly this address: then the
 * link has proved the address (M3.4). The shareable link proves nothing, so it never vouches.
 */
export const vouched = Effect.fn("BetaGate.vouched")(function*(email: string, proof: string) {
  const [id, k] = proof.split(".")
  if (id === undefined || k === undefined || id.startsWith("link_")) return false
  const found = yield* route({ id, k })
  if (found === undefined) return false
  const db = yield* Db
  const rows = yield* db.scopedFor((sql) =>
    sql<{ id: string }>`
      select id from invitations
      where id = ${id} and email = ${email.trim().toLowerCase()} and accepted_at is null and revoked_at is null
        and declined_at is null and expires_at > now()`
  ).pipe(Effect.provideService(CurrentWorkspace, { id: found.workspaceId as WorkspaceId }))
  return rows.length > 0
})
