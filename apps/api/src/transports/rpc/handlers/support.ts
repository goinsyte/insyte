import { SupportRpcs } from "@insyte/api/rpc/SupportRpcs"
import type * as Module from "@insyte/modules/support/Support"
import { Effect } from "effect"

/*
 * Insyte-support's consent and banner (M18). The slice loads with the first call in an isolate, not with the RPC
 * layer (ADR-0041 §3); the frame's banner asks once per page load. A load that fails is a defect of that call; the
 * next one tries again.
 */

let loading: Promise<typeof Module> | undefined

const support = Effect.promise(() => (loading ??= import("@insyte/modules/support/Support").catch((error: unknown) => {
  loading = undefined
  throw error
}))).pipe(Effect.map((m) => m.Support))

export const SupportHandlers = SupportRpcs.toLayer(Effect.succeed(SupportRpcs.of({
  "Support.status": () => Effect.flatMap(support, (s) => s.status()),
  "Support.setAccess": (input) => Effect.flatMap(support, (s) => s.setAccess(input))
})))
