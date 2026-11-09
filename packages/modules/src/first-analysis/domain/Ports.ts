import { Context, type Effect } from "effect"

/** Starts a store's first analysis (M6.5): one `FirstAnalysisWorkflow` instance per analysis, named by its id. */
export class Analyses extends Context.Service<Analyses, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly storeId: string }
  ) => Effect.Effect<void>
}>()("firstAnalysis/Analyses") {}
