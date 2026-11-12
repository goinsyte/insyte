import { Flow, IssueSchema } from "@insyte/domain/automations/Graph"
import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Automations as the console, `/v1` and MCP read and change them (M12 step 1; domain.md §11, widgets/05 §1). A flow is
 * its draft (what the canvas holds and saves as it goes), its published versions, and its settings. Times are epoch
 * milliseconds. Steps are `@insyte/domain/automations/Graph`'s, the same in the browser and here.
 */

export const AutomationStatus = Schema.Literals(["draft", "active", "paused"])
export type AutomationStatus = typeof AutomationStatus.Type

/** Runs per hour at most; 0 is no limit (widgets/05 §1.5). */
export const RateLimit = Schema.Literals([0, 30, 60, 120, 500])

export const Person = Schema.Struct({ id: Schema.String, name: Schema.String })

export class AutomationRow extends Schema.Class<AutomationRow>("automations/AutomationRow")({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  status: AutomationStatus,
  /** The published version; 0 until the first publication. */
  liveVersion: Schema.Int,
  /** The draft's steps, which the list draws as tiles. */
  nodes: Flow,
  /** The draft differs from the live version: "Niet-gepubliceerde wijzigingen". */
  dirty: Schema.Boolean,
  owner: Schema.NullOr(Person),
  runsTotal: Schema.Int,
  template: Schema.NullOr(Schema.String),
  savedAt: Schema.Finite,
  createdAt: Schema.Finite
}) {}

export class AutomationCounts extends Schema.Class<AutomationCounts>("automations/AutomationCounts")({
  all: Schema.Int,
  active: Schema.Int,
  paused: Schema.Int,
  draft: Schema.Int
}) {}

export class AutomationList extends Schema.Class<AutomationList>("automations/AutomationList")({
  rows: Schema.Array(AutomationRow),
  counts: AutomationCounts
}) {}

export class AutomationSettings extends Schema.Class<AutomationSettings>("automations/AutomationSettings")({
  /** Rights a step needs that were switched off; the step cannot run without them. */
  scopesOff: Schema.Array(Schema.String),
  /** Rights granted that no step needs. */
  scopesExtra: Schema.Array(Schema.String),
  /** Who hears when a run fails; `null` is the flow's owner. */
  notify: Schema.NullOr(Person),
  rateLimit: RateLimit
}) {}

export class AutomationVersion extends Schema.Class<AutomationVersion>("automations/AutomationVersion")({
  version: Schema.Int,
  note: Schema.String,
  by: Schema.NullOr(Person),
  at: Schema.Finite,
  nodes: Flow,
  scopesRequired: Schema.Array(Schema.String)
}) {}

export class AutomationDetail extends Schema.Class<AutomationDetail>("automations/AutomationDetail")({
  automation: AutomationRow,
  /** What runs: the live version's steps; `null` until the first publication. */
  liveNodes: Schema.NullOr(Flow),
  settings: AutomationSettings,
  /** Newest first. */
  versions: Schema.Array(AutomationVersion),
  /** What is wrong with the draft, per step: what save shows and publish refuses on. */
  issues: Schema.Array(IssueSchema),
  /** The connected services, by brand id ("shopify", "klaviyo"): a step on one that is not reads "Koppel …". */
  connected: Schema.Array(Schema.String)
}) {}

/** What a change answers: the flow as it now is, and the undo token where there is one. */
export class AutomationChange extends Schema.Class<AutomationChange>("automations/AutomationChange")({
  automation: Schema.NullOr(AutomationDetail),
  undo: Schema.NullOr(UndoTicket)
}) {}

export class DraftSaved extends Schema.Class<DraftSaved>("automations/DraftSaved")({
  savedAt: Schema.Finite,
  issues: Schema.Array(IssueSchema),
  automation: AutomationRow
}) {}

export class TriggerFieldRow extends Schema.Class<TriggerFieldRow>("automations/TriggerFieldRow")({
  path: Schema.String,
  label: Schema.String,
  example: Schema.String
}) {}

/** A template the workspace's own records say would have work to do (widgets/05 §1.2, "Aanbevolen"). */
export class Recommendation extends Schema.Class<Recommendation>("automations/Recommendation")({
  templateId: Schema.String,
  count: Schema.Int,
  line: Schema.String
}) {}

const Name = Schema.String.check(Schema.isMaxLength(120))
const Description = Schema.String.check(Schema.isMaxLength(1000))

export const IdInput = Schema.Struct({ id: Schema.String })
export const FieldsInput = Schema.Struct({ triggerVariant: Schema.String.check(Schema.isMaxLength(64)) })

export const ListInput = Schema.Struct({ status: Schema.optional(AutomationStatus) })

export const CreateInput = Schema.Struct({
  /** A template from the library; without one, an empty draft. */
  templateId: Schema.optional(Schema.String.check(Schema.isMaxLength(64))),
  name: Schema.optional(Name),
  description: Schema.optional(Description),
  /** Steps prepared elsewhere (the first analysis); a template's win over them. */
  nodes: Schema.optional(Flow)
})

export const SaveDraftInput = Schema.Struct({
  id: Schema.String,
  nodes: Flow,
  name: Schema.optional(Name),
  description: Schema.optional(Description)
})

export const PublishInput = Schema.Struct({
  id: Schema.String,
  note: Schema.String.check(Schema.isMaxLength(200))
})

export const SetStatusInput = Schema.Struct({ id: Schema.String, status: Schema.Literals(["active", "paused"]) })

export const UpdateSettingsInput = Schema.Struct({
  id: Schema.String,
  scopesOff: Schema.optional(Schema.Array(Schema.String.check(Schema.isMaxLength(64))).check(Schema.isMaxLength(32))),
  scopesExtra: Schema.optional(
    Schema.Array(Schema.String.check(Schema.isMaxLength(64))).check(Schema.isMaxLength(32))
  ),
  /** `null` is the flow's owner. */
  notifyMemberId: Schema.optional(Schema.NullOr(Schema.String)),
  rateLimit: Schema.optional(RateLimit)
})

/** "Publiceren" with nothing new since the live version. */
export class NothingToPublish extends Schema.TaggedError<NothingToPublish>()("NothingToPublish", {
  version: Schema.Int
}) {}

/** "Publiceren" on a flow that cannot run as it stands: every error, per step (the first is what the toast says). */
export class InvalidFlow extends Schema.TaggedError<InvalidFlow>()("InvalidFlow", {
  issues: Schema.Array(IssueSchema)
}) {}

const SettingsBefore = Schema.Struct({
  scopesOff: Schema.Array(Schema.String),
  scopesExtra: Schema.Array(Schema.String),
  notifyMemberId: Schema.NullOr(Schema.String),
  rateLimit: Schema.Int
})

/** What `automations.restore` puts back. */
export const AutomationsRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("created"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("removed"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("published"),
    id: Schema.String,
    version: Schema.Int,
    status: AutomationStatus,
    liveVersion: Schema.Int,
    triggerVariant: Schema.NullOr(Schema.String)
  }),
  Schema.Struct({ kind: Schema.Literal("status"), id: Schema.String, status: AutomationStatus }),
  Schema.Struct({ kind: Schema.Literal("settings"), id: Schema.String, settings: SettingsBefore })
])
export type AutomationsRestore = typeof AutomationsRestore.Type
