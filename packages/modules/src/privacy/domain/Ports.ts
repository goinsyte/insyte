import { Context, type Effect } from "effect"

/*
 * What Je gegevens needs from the platform (M17 step 5): starting the run that makes an export, and the run that waits
 * out a deletion. Both are Workflows on the jobs Worker, named by the request and its attempt, so a relay that
 * delivers the request twice starts it once, and asking again after a failure starts a new run.
 *
 * The export run is this slice's own (`PrivacyExportWorkflow`) for now. The data hub's reusable `ExportWorkflow`
 * (M14) is being built beside it; once both are in, the workspace export becomes one of its sources and this port
 * starts that instead.
 */
export interface RunInput {
  readonly workspaceId: string
  readonly requestId: string
  readonly attempt: number
}

export class PrivacyRuns extends Context.Service<PrivacyRuns, {
  /** A workspace export or a shopper's access package, by its `gdpr_requests` row and the attempt. */
  readonly startExport: (input: RunInput) => Effect.Effect<void>
  /** A deletion's waiting period, then the purge, unless the request was stopped by then. */
  readonly startDeletion: (input: RunInput) => Effect.Effect<void>
}>()("privacy/PrivacyRuns") {}
