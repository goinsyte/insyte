import { PrivacyRuns } from "@insyte/modules/privacy/domain/Ports"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Privacy = subscriber("privacy", {
  // Je gegevens (M17 step 5): an export or a shopper's package is made by its run, a deletion waits in its own.
  "privacy.export_requested": (_id, event) =>
    Effect.flatMap(
      Effect.service(PrivacyRuns),
      (runs) => runs.startExport({ workspaceId: event.workspaceId, requestId: event.requestId, attempt: event.attempt })
    ),
  "privacy.deletion_requested": (_id, event) =>
    Effect.flatMap(
      Effect.service(PrivacyRuns),
      (runs) =>
        runs.startDeletion({ workspaceId: event.workspaceId, requestId: event.requestId, attempt: event.attempt })
    )
})
