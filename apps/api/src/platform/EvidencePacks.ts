import { EvidencePacks } from "@insyte/modules/chargebacks/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * Starting a case's evidence pack (M13 step 4): an `EvidencePackWorkflow` instance named by the run, so a relay that
 * delivers the request twice gathers it once.
 */
export const EvidencePacksLive = Layer.succeed(EvidencePacks)(EvidencePacks.of({
  start: Effect.fn("EvidencePacks.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.EVIDENCE_PACK.create({
        id: input.runId,
        params: { workspaceId: input.workspaceId, chargebackId: input.chargebackId, runId: input.runId }
      })
    ).pipe(
      // Already started under this name: that instance is the run.
      Effect.catch(() =>
        Effect.flatMap(Effect.tryPromise(() => env.EVIDENCE_PACK.get(input.runId)), () => Effect.void)
      ),
      Effect.orDie
    )
  })
}))
