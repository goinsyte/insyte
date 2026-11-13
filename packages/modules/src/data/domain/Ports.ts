import { Context, type Effect } from "effect"

/*
 * What the Data hub needs from the platform (M14 step 5): starting an uploaded CSV's `ImportParseWorkflow`, named by
 * the import, so a relay that delivers the upload twice reads the file once.
 */
export class ImportParses extends Context.Service<ImportParses, {
  readonly start: (input: { readonly workspaceId: string; readonly importId: string }) => Effect.Effect<void>
}>()("data/ImportParses") {}
