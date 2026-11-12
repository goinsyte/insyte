import { Schema } from "effect"

/*
 * A flow's runs as the Runs tab, Geschiedenis, `/v1` and MCP read them (M12 step 5; api.md §2.14), and "Test met
 * voorbeeld" (M12 step 4). Times are epoch milliseconds. A run is one trigger event for one record on the version that
 * was live when it started; its steps are what the engine wrote (`automation_run_steps`), laid over that version so a
 * lane not taken and a step not reached read as such.
 */

export const RunStatus = Schema.Literals(["running", "waiting", "succeeded", "failed", "stopped", "skipped"])
export type RunStatus = typeof RunStatus.Type

/** How a step went, in the Runs drawer's words: `pending` is one a waiting run has not reached yet. */
export const StepStatus = Schema.Literals(["ok", "error", "skipped", "waiting", "pending", "stopped"])
export type StepStatus = typeof StepStatus.Type

export const RunRecordRef = Schema.Struct({
  kind: Schema.Literals(["order", "customer", "ticket", "chargeback", "product"]),
  id: Schema.String,
  number: Schema.String,
  name: Schema.String
})

export class RunRow extends Schema.Class<RunRow>("automations/RunRow")({
  id: Schema.String,
  automationId: Schema.String,
  automationName: Schema.String,
  version: Schema.Int,
  status: RunStatus,
  /** Why it failed, stopped or was skipped, in plain words. */
  reason: Schema.NullOr(Schema.String),
  triggerVariant: Schema.String,
  /** What started it, in the trigger's words. */
  cause: Schema.String,
  record: Schema.NullOr(RunRecordRef),
  /** Started by hand ("Opnieuw", or `/v1`) rather than by its trigger. */
  manual: Schema.Boolean,
  /** The first run of this record and event: "Opnieuw" keeps it, and what that run did is not done again. */
  key: Schema.String,
  startedAt: Schema.Finite,
  finishedAt: Schema.NullOr(Schema.Finite),
  durationMs: Schema.Int,
  /** Steps that did something (succeeded or failed). */
  steps: Schema.Int
}) {}

export class RunCounts extends Schema.Class<RunCounts>("automations/RunCounts")({
  all: Schema.Int,
  running: Schema.Int,
  waiting: Schema.Int,
  succeeded: Schema.Int,
  failed: Schema.Int,
  stopped: Schema.Int,
  skipped: Schema.Int
}) {}

export class RunList extends Schema.Class<RunList>("automations/RunList")({
  rows: Schema.Array(RunRow),
  counts: RunCounts,
  /** The cursor for the next page, or `null` at the end. */
  next: Schema.NullOr(Schema.String)
}) {}

export class RunStep extends Schema.Class<RunStep>("automations/RunStep")({
  nodeId: Schema.String,
  variantId: Schema.String,
  /** The step's settings in the run's version, for its title. */
  config: Schema.Record(Schema.String, Schema.Unknown),
  lane: Schema.NullOr(Schema.Literals(["yes", "no"])),
  status: StepStatus,
  ms: Schema.Int,
  attempt: Schema.Int,
  explanation: Schema.NullOr(Schema.String)
}) {}

/** What the run waits on: a teammate's answer, the customer's, or the clock. */
export const WaitingOn = Schema.Struct({
  nodeId: Schema.String,
  kind: Schema.Literals(["approval", "reply", "wait"]),
  /** For an approval: who the step names. */
  approver: Schema.NullOr(Schema.String)
})

export class RunDetail extends Schema.Class<RunDetail>("automations/RunDetail")({
  run: RunRow,
  steps: Schema.Array(RunStep),
  /** The record as the run read it when it started. */
  input: Schema.Record(Schema.String, Schema.String),
  waitingOn: Schema.NullOr(WaitingOn)
}) {}

export class RunDay extends Schema.Class<RunDay>("automations/RunDay")({
  /** `YYYY-MM-DD`, in the workspace's own days as the server counts them (UTC). */
  day: Schema.String,
  succeeded: Schema.Int,
  failed: Schema.Int,
  other: Schema.Int
}) {}

export class RunStats extends Schema.Class<RunStats>("automations/RunStats")({
  days: Schema.Array(RunDay),
  totals: RunCounts
}) {}

export class RunRecord extends Schema.Class<RunRecord>("automations/RunRecord")({
  record: RunRecordRef,
  runs: Schema.Int,
  lastStatus: RunStatus,
  lastAt: Schema.Finite
}) {}

export class RunChange extends Schema.Class<RunChange>("automations/RunChange")({
  run: RunRow
}) {}

/* ── "Test met voorbeeld" ──────────────────────────────────────────────────────────────────── */

export class TestStep extends Schema.Class<TestStep>("automations/TestStep")({
  nodeId: Schema.String,
  variantId: Schema.String,
  lane: Schema.NullOr(Schema.Literals(["yes", "no"])),
  status: Schema.Literals(["ok", "error", "skipped", "stopped"]),
  /** What the step would have done, or why it would not. */
  explanation: Schema.NullOr(Schema.String)
}) {}

export class TestResult extends Schema.Class<TestResult>("automations/TestResult")({
  ok: Schema.Boolean,
  /** The record the test walked; `null` when the workspace has none to walk. */
  sample: Schema.NullOr(RunRecordRef),
  steps: Schema.Array(TestStep),
  /** The step it stopped at, and why. */
  stoppedAt: Schema.NullOr(Schema.String),
  reason: Schema.NullOr(Schema.String)
}) {}

/* ── inputs ────────────────────────────────────────────────────────────────────────────────── */

export const RunListInput = Schema.Struct({
  automationId: Schema.optional(Schema.String),
  status: Schema.optional(RunStatus),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  cursor: Schema.optional(Schema.NullOr(Schema.String))
})

export const RunIdInput = Schema.Struct({ id: Schema.String })

export const RunStatsInput = Schema.Struct({
  automationId: Schema.String,
  days: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 90 }))
})

export const RunRecordsInput = Schema.Struct({
  automationId: Schema.String,
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })))
})

export const RunDecideInput = Schema.Struct({ id: Schema.String, stepId: Schema.String })

/** A run started by hand (`POST /v1/automations/{id}/runs`): the flow's live version on one record. */
export const RunStartInput = Schema.Struct({ automationId: Schema.String, recordId: Schema.String })

export const TestInput = Schema.Struct({
  id: Schema.String,
  /** The order to walk; the newest one in the flow's stores when absent. */
  recordRef: Schema.optional(Schema.String)
})
