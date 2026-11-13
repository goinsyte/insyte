import { ImportParses } from "@insyte/modules/data/domain/Ports"
import { ExportRuns } from "@insyte/modules/shared/domain/Exports"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Data = subscriber("data", {
  // An uploaded CSV (M14 step 5): its `ImportParseWorkflow`, named by the import.
  "import.uploaded": (_id, event) =>
    Effect.flatMap(
      Effect.service(ImportParses),
      (parses) => parses.start({ workspaceId: event.workspaceId, importId: event.importId })
    ),
  // An export asked for, from any slice (M14 step 5): its `ExportWorkflow`, named by the export.
  "export.requested": (_id, event) =>
    Effect.flatMap(
      Effect.service(ExportRuns),
      (runs) => runs.start({ workspaceId: event.workspaceId, exportId: event.exportId })
    )
})
