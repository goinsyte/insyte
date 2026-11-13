import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/* Automations (M12): the flows, one flow, its runs, and running it for an order now. */

/** A flow (M12 step 1): its definition, as the builder holds it. */
export const AutomationStepV1 = Schema.Struct({
  id: Schema.String,
  step: Schema.String.annotate({ description: "The step's kind, as `trigger.order_shipped` or `action.send_email`." }),
  config: Schema.Record(Schema.String, Schema.Unknown),
  branches: Schema.optional(
    Schema.Struct({
      yes: Schema.Array(
        Schema.Struct({ id: Schema.String, step: Schema.String, config: Schema.Record(Schema.String, Schema.Unknown) })
      ),
      no: Schema.Array(
        Schema.Struct({ id: Schema.String, step: Schema.String, config: Schema.Record(Schema.String, Schema.Unknown) })
      )
    })
  ).annotate({ description: "A yes/no split's two lanes, which merge back into the line after it." })
})

export const AutomationV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  status: Schema.String.annotate({ description: "draft (never published), active or paused." }),
  live_version: Schema.Int.annotate({ description: "The published version that runs; 0 for a draft." }),
  trigger: Schema.NullOr(Schema.String).annotate({ description: "The draft's trigger step, if it has one." }),
  unpublished_changes: Schema.Boolean,
  owner: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
  runs_total: Schema.Int,
  saved_at: Schema.String,
  created_at: Schema.String
})

export const AutomationPageV1 = Schema.Struct({
  data: Schema.Array(AutomationV1),
  counts: Schema.Struct({ all: Schema.Int, active: Schema.Int, paused: Schema.Int, draft: Schema.Int })
})

export const AutomationDetailV1 = Schema.Struct({
  ...AutomationV1.fields,
  draft: Schema.Array(AutomationStepV1),
  live: Schema.NullOr(Schema.Array(AutomationStepV1)),
  versions: Schema.Array(
    Schema.Struct({
      version: Schema.Int,
      note: Schema.String,
      published_at: Schema.String,
      published_by: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String }))
    })
  ),
  issues: Schema.Array(
    Schema.Struct({
      step_id: Schema.NullOr(Schema.String),
      code: Schema.String,
      field: Schema.NullOr(Schema.String),
      severity: Schema.String.annotate({ description: "error stops publishing; warning does not." }),
      message: Schema.String
    })
  )
})

export const AutomationStatusFilter = Schema.Literals(["draft", "active", "paused"])

/** A flow's run (M12 step 5): one trigger event for one record, on the version that was live when it started. */
export const AutomationRunV1 = Schema.Struct({
  id: Schema.String,
  automation_id: Schema.String,
  version: Schema.Int,
  status: Schema.String.annotate({ description: "running, waiting, succeeded, failed, stopped or skipped." }),
  reason: Schema.NullOr(Schema.String).annotate({ description: "Why it failed, stopped or was skipped." }),
  trigger: Schema.String,
  manual: Schema.Boolean.annotate({ description: "Started by hand (again, or through this API)." }),
  record: Schema.NullOr(Schema.Struct({ type: Schema.String, id: Schema.String, number: Schema.String })),
  started_at: Schema.String,
  finished_at: Schema.NullOr(Schema.String),
  steps: Schema.Array(
    Schema.Struct({
      step_id: Schema.String,
      step: Schema.String,
      lane: Schema.NullOr(Schema.String),
      status: Schema.String.annotate({ description: "ok, error, skipped, waiting, pending or stopped." }),
      explanation: Schema.NullOr(Schema.String)
    })
  ).annotate({ description: "Each step of the run's version and what it did; empty in a list." })
})

export const AutomationRunPageV1 = Schema.Struct({
  data: Schema.Array(AutomationRunV1),
  next_cursor: Schema.NullOr(Schema.String)
})

export const AutomationRunStatusFilter = Schema.Literals([
  "running",
  "waiting",
  "succeeded",
  "failed",
  "stopped",
  "skipped"
])

export class AutomationsGroup extends HttpApiGroup.make("automations")
  .add(
    HttpApiEndpoint.get("automations", "/automations", {
      query: Schema.Struct({ status: Schema.optional(AutomationStatusFilter) }),
      success: AutomationPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's flows, newest first, with each status's count. Needs `automations.read`."
    ),
    HttpApiEndpoint.get("automation", "/automations/:id", {
      params: ById,
      success: AutomationDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One flow: its draft and live steps, its published versions, and what is wrong with the draft per step. Needs `automations.read`."
    ),
    HttpApiEndpoint.get("runs", "/automations/:id/runs", {
      params: ById,
      query: Schema.Struct({
        status: Schema.optional(AutomationRunStatusFilter),
        limit: Schema.optional(Schema.FiniteFromString),
        cursor: Schema.optional(Schema.String)
      }),
      success: AutomationRunPageV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "The flow's runs, newest first, in pages of up to 200. Needs `automations.read`."
    ),
    HttpApiEndpoint.post("startRun", "/automations/:id/runs", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ order_id: Schema.String }),
      success: AutomationRunV1,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Runs the flow's live version for one order now, as its trigger would, and answers the run as it started; its steps act as the flow's own service account. Refused for a flow never published (`409`, `not_published`); a paused flow's run is written `skipped`. Needs `automations.write`."
    )
  )
  .annotate(OpenApi.Title, "Automations")
{}
