import { Context, type Effect } from "effect"

/*
 * What the chargebacks slice needs from the platform (M13 step 4): starting a case's `EvidencePackWorkflow`, named by
 * its run, so a relay that delivers the request twice gathers the pack once.
 */
export class EvidencePacks extends Context.Service<EvidencePacks, {
  readonly start: (input: {
    readonly workspaceId: string
    readonly chargebackId: string
    readonly runId: string
  }) => Effect.Effect<void>
}>()("chargebacks/EvidencePacks") {}
