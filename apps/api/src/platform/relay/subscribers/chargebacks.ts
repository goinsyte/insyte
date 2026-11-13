import { EvidencePacks } from "@insyte/modules/chargebacks/domain/Ports"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Chargebacks = subscriber("chargebacks", {
  // Evidence packs asked for (M13 step 4): one Workflow per case, named by its run.
  "chargeback.pack_requested": (_id, event) =>
    Effect.forEach(
      event.packs,
      (p) =>
        Effect.flatMap(
          Effect.service(EvidencePacks),
          (packs) => packs.start({ workspaceId: event.workspaceId, chargebackId: p.chargebackId, runId: p.runId })
        ),
      { discard: true }
    )
})
