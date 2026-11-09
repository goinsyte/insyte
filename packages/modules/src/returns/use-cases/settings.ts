import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { ReturnSettingsDoc } from "../domain/Returns.ts"
import type { Resolution, Rule, SpecialWindow } from "../domain/Rules.ts"

/*
 * Instellingen → Retouren (M9.1; widgets/03 `/settings/returns`): one document over the settings row, the reasons,
 * the product rules, the addresses and the claim flow. The first read makes them with the code's defaults
 * (`DEFAULT_REASONS` and the design's texts), so a workspace always has a policy. Reading takes Retouren · Bekijken, saving Beheren; a
 * save replaces the whole document on one transaction, with one undo that puts the previous document back.
 */

export const RESTORE = "returns.restore"

const OFFERED: ReadonlyArray<Resolution> = ["refund", "exchange", "gift_card", "replacement", "discount"]

const DEFAULT_REASONS = [
  { id: "too_small", label: "Te klein", type: "return", photo: false, quality: false, days: null },
  { id: "too_big", label: "Te groot", type: "return", photo: false, quality: false, days: null },
  { id: "not_as_expected", label: "Anders dan verwacht", type: "return", photo: false, quality: false, days: null },
  { id: "damaged", label: "Beschadigd aangekomen", type: "claim", photo: true, quality: true, days: 14 },
  { id: "wrong_item", label: "Verkeerd artikel", type: "claim", photo: true, quality: false, days: 14 },
  { id: "quality", label: "Kwaliteit", type: "claim", photo: true, quality: true, days: null }
] as const

const DEFAULT_REJECT = [
  "Buiten de retourtermijn",
  "Artikel is niet retourneerbaar (sale of hygiëne)",
  "Gedragen of gewassen",
  "Geen foto's van het probleem"
]

const DEFAULT_STEPS = ["Wat is er mis", "Foto's van het artikel en de verpakking", "Wat wil je dat we doen"]

const INTRO = "Iets terugsturen of een probleem melden? Vul je bestelnummer en e-mailadres in."
const DONE = "We bekijken je aanvraag binnen twee werkdagen. " +
  "Je krijgt een mail met het retourlabel zodra we hem hebben goedgekeurd."

/** The workspace's settings, made with the defaults when there are none yet. */
export const ensure = Effect.fn("Returns.ensureSettings")(function*(sql: SqlClient.SqlClient) {
  const { workspaceId } = yield* CurrentPrincipal
  const [had] = yield* sql`select 1 from return_settings where workspace_id = ${workspaceId}`
  if (had !== undefined) return
  const [ws] = yield* sql<{ slug: string }>`select slug from workspaces where id = ${workspaceId}`
  // The slug is unique among workspaces; a portal handle taken by an earlier name gets the id's tail.
  const [taken] = yield* sql`select 1 from return_settings where portal_slug = ${ws!.slug}`
  const slug = taken === undefined ? ws!.slug : `${ws!.slug}-${workspaceId.slice(-6)}`
  const inserted = yield* sql`
    insert into return_settings (workspace_id, offered_resolutions, reject_reasons, portal_slug, portal_intro,
                                 portal_done)
    values (${workspaceId}, ${[...OFFERED]}::text[], ${DEFAULT_REJECT}::text[], ${slug}, ${INTRO}, ${DONE})
    on conflict (workspace_id) do nothing returning workspace_id`
  if (inserted.length === 0) return
  for (const [i, r] of DEFAULT_REASONS.entries()) {
    yield* sql`insert into return_reasons (id, workspace_id, label, type, photo_required, counts_for_quality,
                                          window_days, position)
               values (${r.id}, ${workspaceId}, ${r.label}, ${r.type}, ${r.photo}, ${r.quality}, ${r.days}, ${i})
               on conflict do nothing`
  }
  yield* sql`insert into claim_flows (workspace_id, steps) values (${workspaceId}, ${DEFAULT_STEPS}::text[])
             on conflict do nothing`
})

export interface ReasonRow {
  readonly id: string
  readonly label: string
  readonly type: "return" | "claim" | "both"
  readonly photoRequired: boolean
  readonly countsForQuality: boolean
  readonly windowDays: number | null
}

/** The settings as the use cases read them. */
export interface Loaded {
  readonly returnDays: number
  readonly claimDays: number
  readonly specialWindows: ReadonlyArray<SpecialWindow & { readonly id: string }>
  readonly offered: ReadonlyArray<Resolution>
  readonly giftCardBonusPct: number
  readonly exchangeFeeMinor: number
  readonly rejectReasons: ReadonlyArray<string>
  readonly portal: { readonly on: boolean; readonly handle: string; readonly intro: string; readonly done: string }
  readonly reasons: ReadonlyArray<ReasonRow>
  readonly rules: ReadonlyArray<Rule & { readonly label: string }>
  readonly addresses: ReadonlyArray<
    { readonly country: string; readonly label: string; readonly address: string; readonly carrier: string }
  >
  readonly claimSteps: ReadonlyArray<string>
}

export const load = Effect.fn("Returns.loadSettings")(function*(sql: SqlClient.SqlClient) {
  yield* ensure(sql)
  const [s] = yield* sql<{
    returnDays: number
    claimDays: number
    specialWindows: string
    offeredResolutions: ReadonlyArray<Resolution>
    giftCardBonusPct: string
    exchangeFeeMinor: string
    rejectReasons: ReadonlyArray<string>
    portalOn: boolean
    portalSlug: string
    portalIntro: string
    portalDone: string
  }>`
    select return_days, claim_days, special_windows::text as special_windows, offered_resolutions,
           gift_card_bonus_pct, exchange_fee_minor, reject_reasons, portal_on, portal_slug, portal_intro, portal_done
    from return_settings`
  const reasons = yield* sql<ReasonRow>`
    select id, label, type, photo_required, counts_for_quality, window_days from return_reasons order by position, id`
  const rules = yield* sql<Rule & { label: string }>`
    select id, match, match_ref, policy, note, label from return_rules order by position, id`
  const addresses = yield* sql<{ country: string; label: string; address: string; carrier: string }>`
    select country, label, address, carrier from return_addresses order by country`
  const [flow] = yield* sql<{ steps: ReadonlyArray<string> }>`select steps from claim_flows`
  return {
    returnDays: s!.returnDays,
    claimDays: s!.claimDays,
    // Read as text: the SQL client camelCases the keys of a jsonb value.
    specialWindows: JSON.parse(s!.specialWindows),
    offered: s!.offeredResolutions,
    giftCardBonusPct: Number(s!.giftCardBonusPct),
    exchangeFeeMinor: Number(s!.exchangeFeeMinor),
    rejectReasons: s!.rejectReasons,
    portal: { on: s!.portalOn, handle: s!.portalSlug, intro: s!.portalIntro, done: s!.portalDone },
    reasons,
    rules,
    addresses,
    claimSteps: flow?.steps ?? []
  } satisfies Loaded
})

const MATCH_OF = { product: "product", variant: "variant", tag: "shopify_tag" } as const

export const toDoc = (s: Loaded): ReturnSettingsDoc =>
  new ReturnSettingsDoc({
    returnDays: s.returnDays,
    claimDays: s.claimDays,
    specialWindows: s.specialWindows.map((w) => ({ id: w.id, label: w.label, days: w.days, from: w.from, to: w.to })),
    reasons: s.reasons.map((r) => ({
      id: r.id,
      label: r.label,
      claim: r.type === "claim",
      photoRequired: r.photoRequired,
      quality: r.countsForQuality,
      windowDays: r.windowDays
    })),
    rules: s.rules.map((r) => ({
      id: r.id,
      kind: r.policy,
      target: r.match === "shopify_tag"
        ? { by: "tag" as const, tag: r.matchRef }
        : r.match === "variant"
        ? { by: "variant" as const, variantId: r.matchRef, label: r.label }
        : { by: "product" as const, productId: r.matchRef, label: r.label },
      note: r.note
    })),
    offered: [...s.offered],
    giftCardBonusPct: s.giftCardBonusPct,
    exchangeFeeMinor: s.exchangeFeeMinor,
    addresses: s.addresses.map((a) => ({
      country: a.country,
      label: a.label,
      address: a.address,
      carrier: a.carrier as "PostNL"
    })),
    claimSteps: [...s.claimSteps],
    rejectReasons: [...s.rejectReasons],
    portal: s.portal
  })

export const get = Effect.fn("Returns.settings.get")(function*() {
  yield* Policy.require("returns", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.map(load(sql), toDoc))
})

/** Writes the document over what is there, the portal handle aside (it is not editable yet). */
const write = Effect.fn("Returns.writeSettings")(function*(sql: SqlClient.SqlClient, doc: ReturnSettingsDoc) {
  const { id, workspaceId } = yield* CurrentPrincipal
  yield* sql`update return_settings set return_days = ${doc.returnDays}, claim_days = ${doc.claimDays},
               special_windows = ${JSON.stringify(doc.specialWindows)}::jsonb,
               offered_resolutions = ${[
    ...new Set(doc.offered)
  ]}::text[], gift_card_bonus_pct = ${doc.giftCardBonusPct},
               exchange_fee_minor = ${doc.exchangeFeeMinor}, reject_reasons = ${[...doc.rejectReasons]}::text[],
               portal_on = ${doc.portal.on}, portal_intro = ${doc.portal.intro}, portal_done = ${doc.portal.done},
               updated_by = ${id}, updated_at = now()`
  // A reason's id is what returns point at: existing ones are updated, new ones added, missing ones kept for history.
  for (const [i, r] of doc.reasons.entries()) {
    yield* sql`insert into return_reasons (id, workspace_id, label, type, photo_required, counts_for_quality,
                                          window_days, position)
               values (${r.id}, ${workspaceId}, ${r.label}, ${r.claim ? "claim" : "return"}, ${r.photoRequired},
                       ${r.quality}, ${r.windowDays}, ${i})
               on conflict (workspace_id, id) do update set label = excluded.label, type = excluded.type,
                 photo_required = excluded.photo_required, counts_for_quality = excluded.counts_for_quality,
                 window_days = excluded.window_days, position = excluded.position`
  }
  yield* sql`delete from return_rules`
  for (const [i, r] of doc.rules.entries()) {
    const ref = r.target.by === "tag"
      ? r.target.tag.trim().toLowerCase()
      : r.target.by === "variant"
      ? r.target.variantId
      : r.target.productId
    const label = r.target.by === "tag" ? "" : r.target.label
    yield* sql`insert into return_rules (id, workspace_id, match, match_ref, label, policy, note, position)
               values (${r.id.startsWith("rrl_") ? r.id : mintId("rrl")}, ${workspaceId}, ${MATCH_OF[r.target.by]},
                       ${ref}, ${label}, ${r.kind}, ${r.note.trim()}, ${i})`
  }
  yield* sql`delete from return_addresses`
  for (const a of doc.addresses) {
    yield* sql`insert into return_addresses (id, workspace_id, country, label, address, carrier)
               values (${mintId("rad")}, ${workspaceId}, ${a.country}, ${a.label}, ${a.address}, ${a.carrier})`
  }
  yield* sql`update claim_flows set steps = ${[...doc.claimSteps]}::text[]`
})

const invalid = (doc: ReturnSettingsDoc): Record<string, string> | null => {
  const fields: Record<string, string> = {}
  if (new Set(doc.reasons.map((r) => r.id)).size !== doc.reasons.length) fields["reasons"] = "duplicate"
  if (new Set(doc.addresses.map((a) => a.country)).size !== doc.addresses.length) fields["addresses"] = "duplicate"
  return Object.keys(fields).length === 0 ? null : fields
}

export const set = Effect.fn("Returns.settings.set")(function*(doc: ReturnSettingsDoc) {
  yield* Policy.require("returns", 3)
  const principal = yield* CurrentPrincipal
  const fields = invalid(doc)
  if (fields !== null) return yield* new Invalid({ fields })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const before = toDoc(yield* load(sql))
      yield* write(sql, doc)
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "returns.settings_updated",
        subjectType: "workspace",
        subjectId: principal.workspaceId,
        diff: { returnDays: doc.returnDays, claimDays: doc.claimDays, portalOn: doc.portal.on }
      })
      const document = yield* Schema.encodeEffect(ReturnSettingsDoc)(before).pipe(Effect.orDie)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { kind: "settings", document } })
      return { settings: toDoc(yield* load(sql)), undo }
    })
  )
})

const decodeDoc = Schema.decodeUnknownEffect(ReturnSettingsDoc)

/** The undo of a save: the document as it was. */
export const restoreSettings = Effect.fn("Returns.restoreSettings")(function*(
  sql: SqlClient.SqlClient,
  document: unknown
) {
  yield* Policy.require("returns", 3)
  yield* write(sql, yield* decodeDoc(document).pipe(Effect.orDie))
})
