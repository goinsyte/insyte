import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { Evidence, ProposalAction } from "../domain/Proposals.ts"

/*
 * The rule-based proposer (M10.2; domain.md §9.1: "until M15 a rule-based proposer writes the plate from a template").
 * For a queue row it knows, it reads the record and the workspace's own policy and draws a plate only where every rule
 * holds; where one does not, it draws nothing and the row is the operator's to start. The confidence is computed from
 * the records, never made up, and the plate says what it rests on.
 *
 *   a return or claim in review  → ApproveReturn, when it is inside its window, its product may come back (and in the
 *                                  way asked), the photos its reason asks for are there and the resolution is offered;
 *                                  confidence from how many returns the customer started in the last 90 days
 *   a quality check sent in      → ApproveQualityCheck, unless the supplier's checks were rejected more often than not;
 *                                  confidence from the supplier's earlier verdicts
 */

/** One plate as the rule draws it, before it is a record. */
export interface Draft {
  readonly number: string
  readonly storeId: string | null
  readonly area: string
  readonly subjectType: string
  readonly subjectId: string
  readonly action: ProposalAction
  readonly dedupeKey: string
  readonly expiresAt: Date | null
  readonly heading: string
  readonly body: string
  readonly dimension: string
  readonly before: { readonly label: string; readonly value: string }
  readonly after: { readonly label: string; readonly value: string }
  readonly change: string
  readonly witness: string
  readonly confidence: number
  readonly confidenceBasis: string
  readonly fileLabel: string
  readonly why: string
  readonly evidence: ReadonlyArray<typeof Evidence.Type>
}

/** A queue row the proposer may draw for: the kinds it knows. */
export interface Drawable {
  readonly queueItemId: string
  readonly kind: string
  readonly subjectId: string
}

const AS_IS = "Zoals het record nu is"
const AS_DRAWN = "Zoals getekend"
const CHANGE = "wat dit voorstel verandert"

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(minor / 100)

const when = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(d)

const RESOLUTION: Record<string, string> = {
  refund: "terugbetalen",
  exchange: "ruilen",
  gift_card: "cadeaubon",
  replacement: "nieuw artikel",
  discount: "kortingscode"
}

const KIND: Record<string, string> = { sample: "monster", batch: "partij", test_order: "testbestelling" }

const ordinal = (n: number) => `${n}e`

/* ── returns and claims ───────────────────────────────────────────────────────────────────────────────────────── */

interface ReturnFacts {
  readonly id: string
  readonly number: string
  readonly type: "return" | "claim"
  readonly status: string
  readonly storeId: string
  readonly storeName: string
  readonly customerId: string | null
  readonly customerName: string
  readonly customerEmail: string | null
  readonly currency: string
  readonly amountMinor: string
  readonly items: string
  readonly reasonLabel: string | null
  readonly photoRequired: boolean | null
  readonly hasPhotos: boolean
  readonly outsideWindow: boolean
  readonly windowUntil: Date | null
  readonly reviewDeadline: Date
  readonly requested: string
  readonly rulePolicy: string | null
  readonly ruleLabel: string | null
  readonly offered: ReadonlyArray<string> | null
  readonly solutions: ReadonlyArray<string> | null
  readonly returnDays: number | null
  readonly claimDays: number | null
  readonly prior: number
}

const returnFacts = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([] as ReadonlyArray<ReturnFacts>) : sql<ReturnFacts>`
    select r.id, r.number, r.type, r.status, r.store_id, s.name as store_name, r.customer_id, r.customer_name,
           r.customer_email, r.currency, r.outside_window, r.window_until, r.review_deadline,
           r.requested_resolution as requested, rr.label as reason_label, rr.photo_required,
           ru.policy as rule_policy, ru.label as rule_label, st.offered_resolutions as offered, cf.solutions,
           st.return_days, st.claim_days,
           (select coalesce(sum(rl.quantity * ol.unit_price_minor), 0) from return_lines rl
              join order_lines ol on ol.id = rl.order_line_id where rl.return_id = r.id)::bigint as amount_minor,
           (select coalesce(sum(rl.quantity), 0) from return_lines rl where rl.return_id = r.id)::bigint as items,
           exists (select 1 from return_lines rl where rl.return_id = r.id and cardinality(rl.photos) > 0)
             as has_photos,
           (select count(*) from returns o where o.customer_id = r.customer_id and o.id <> r.id
              and o.created_at > now() - interval '90 days')::int as prior
    from returns r join stores s on s.id = r.store_id
    left join return_reasons rr on rr.workspace_id = r.workspace_id and rr.id = r.reason_id
    left join return_rules ru on ru.id = r.rule_id
    left join return_settings st on st.workspace_id = r.workspace_id
    left join claim_flows cf on cf.workspace_id = r.workspace_id
    where r.id in ${sql.in([...ids])}`

/** The checks a return passes for "Goedkeuren" to be drawn, or why not. */
const returnChecks = (r: ReturnFacts) => {
  const kind = r.type === "claim" ? "claim" : "retour"
  const days = r.type === "claim" ? r.claimDays : r.returnDays
  const held: Array<string> = []
  const failed: Array<string> = []
  if (r.outsideWindow) failed.push(`buiten de termijn van ${days ?? "?"} dagen`)
  else held.push(days === null ? "binnen de termijn" : `binnen de termijn van ${days} dagen`)
  if (r.rulePolicy === "not_returnable") failed.push(`${r.ruleLabel || "het product"} mag niet terug`)
  else if (r.rulePolicy === "refund_only" && r.requested !== "refund") {
    failed.push("het product mag alleen terugbetaald")
  } else if (r.rulePolicy === "exchange_only" && r.requested !== "exchange") {
    failed.push("het product mag alleen geruild")
  } else {held.push(
      r.rulePolicy === null ? "het product mag terug" : `het product mag terug (${r.ruleLabel || "regel"})`
    )}
  if (r.photoRequired === true) {
    if (r.hasPhotos) held.push(`de foto's die ${r.reasonLabel?.toLowerCase() ?? "de reden"} vraagt zijn er`)
    else failed.push(`de foto's die ${r.reasonLabel?.toLowerCase() ?? "de reden"} vraagt ontbreken`)
  }
  const allowed = r.type === "claim" ? r.solutions : r.offered
  // A workspace that never opened its returns settings has no policy row yet: no resolution rule to check against.
  if (allowed === null) held.push("geen beperking op de oplossing ingesteld")
  else if (allowed.includes(r.requested)) held.push(`${RESOLUTION[r.requested] ?? r.requested} wordt aangeboden`)
  else failed.push(`${RESOLUTION[r.requested] ?? r.requested} wordt niet aangeboden`)
  return { kind, held, failed, policy: allowed !== null || r.returnDays !== null }
}

/** How sure: the customer's returns in the last 90 days besides this one. */
const returnConfidence = (r: ReturnFacts) => {
  if (r.customerId === null) return { confidence: 0.75, basis: "klant zonder profiel, geen eerdere retouren te zien" }
  if (r.prior === 0) return { confidence: 0.92, basis: "eerste retour van deze klant in 90 dagen" }
  if (r.prior === 1) return { confidence: 0.8, basis: "2e retour van deze klant in 90 dagen" }
  return { confidence: 0.6, basis: `${ordinal(r.prior + 1)} retour van deze klant in 90 dagen` }
}

export const drawReturn = (r: ReturnFacts, timeZone: string): Draft | null => {
  if (r.status !== "review") return null
  const checks = returnChecks(r)
  if (checks.failed.length > 0) return null
  const { confidence, basis } = returnConfidence(r)
  const Kind = r.type === "claim" ? "Claim" : "Retour"
  const amount = money(Number(r.amountMinor), r.currency)
  const items = Number(r.items)
  const next = r.type === "claim" ? "wacht op het artikel" : "wacht op het pakket"
  const mail = r.customerEmail === null ? "" : " · klant krijgt de goedkeuring per mail"
  const policy = checks.policy ? "het retourbeleid" : "de standaardregels (er is nog geen retourbeleid opgeslagen)"
  return {
    number: r.number,
    storeId: r.storeId,
    area: "returns",
    subjectType: "return",
    subjectId: r.id,
    action: { _tag: "ApproveReturn", returnId: r.id },
    dedupeKey: `approve:${r.id}`,
    expiresAt: null,
    heading: `${Kind} ${r.number} goedkeuren`,
    body: `Getekend op basis van ${policy}: ${checks.held.join(", ")}. ${
      basis.charAt(0).toUpperCase() + basis.slice(1)
    }. Goedkeuren zet de ${checks.kind} op "${next}"${r.customerEmail === null ? "" : " en mailt de klant"}.`,
    dimension: `beoordelen vóór ${when(r.reviewDeadline, timeZone)}`,
    before: {
      label: AS_IS,
      value: `In beoordeling · ${items} ${items === 1 ? "artikel" : "artikelen"} · ${amount}${
        r.reasonLabel ? ` · ${r.reasonLabel}` : ""
      }`
    },
    after: { label: AS_DRAWN, value: `Goedgekeurd · ${RESOLUTION[r.requested] ?? r.requested} · ${next}${mail}` },
    change: CHANGE,
    witness: r.storeName,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Goedkeuren zoals getekend",
    why: checks.held.map((h) => h.charAt(0).toUpperCase() + h.slice(1) + ".").join(" "),
    evidence: [
      { kind: "return", ref: r.id, summary: `${Kind} ${r.number}, ${r.customerName || "klant"}, ${amount}` },
      { kind: "return_settings", ref: "returns", summary: checks.held.join("; ") },
      ...(r.customerId === null
        ? []
        : [{ kind: "customer", ref: r.customerId, summary: `${r.prior} andere retouren in 90 dagen` }])
    ]
  }
}

/* ── quality checks ───────────────────────────────────────────────────────────────────────────────────────────── */

interface CheckFacts {
  readonly id: string
  readonly status: string
  readonly kind: string
  readonly storeId: string
  readonly storeName: string
  readonly product: string
  readonly supplierId: string
  readonly supplier: string
  readonly batch: string | null
  readonly video: boolean
  readonly media: number
  readonly submittedAt: Date | null
  readonly approved: number
  readonly rejected: number
}

const checkFacts = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([] as ReadonlyArray<CheckFacts>) : sql<CheckFacts>`
    select q.id, q.status, q.kind, p.store_id, st.name as store_name, p.title as product, q.supplier_id,
           s.name as supplier, q.batch, q.video, q.submitted_at,
           (select count(*) from quality_check_media m where m.check_id = q.id)::int as media,
           (select count(*) from quality_checks e where e.supplier_id = q.supplier_id and e.id <> q.id
              and e.status = 'approved')::int as approved,
           (select count(*) from quality_checks e where e.supplier_id = q.supplier_id and e.id <> q.id
              and e.status = 'rejected')::int as rejected
    from quality_checks q join products p on p.id = q.product_id join suppliers s on s.id = q.supplier_id
    join stores st on st.id = p.store_id
    where q.id in ${sql.in([...ids])}`

/** The check's own number on the drawing: the id has none, so its tail. */
const checkNumber = (id: string) => `KC-${id.slice(-4).toUpperCase()}`

export const drawCheck = (c: CheckFacts, timeZone: string): Draft | null => {
  if (c.status !== "submitted") return null
  const decided = c.approved + c.rejected
  // A supplier whose checks were turned down more often than not is the operator's call, not a plate's.
  if (c.rejected > c.approved) return null
  // Laplace's rule over the supplier's earlier verdicts: a first check is a coin toss until there is a record.
  const confidence = (c.approved + 1) / (decided + 2)
  const basis = decided === 0
    ? `eerste controle van ${c.supplier}`
    : `${c.approved} van ${decided} eerdere controles van ${c.supplier} goedgekeurd`
  const files = `${c.media} ${c.media === 1 ? "foto" : "foto's"}${c.video ? " en een video" : ""}`
  return {
    number: checkNumber(c.id),
    storeId: c.storeId,
    area: "products",
    subjectType: "quality_check",
    subjectId: c.id,
    action: { _tag: "ApproveQualityCheck", checkId: c.id },
    dedupeKey: `approve:${c.id}`,
    expiresAt: null,
    heading: `Kwaliteitscontrole ${c.product} goedkeuren`,
    body: `Getekend op basis van wat ${c.supplier} instuurde: ${files}${c.batch ? ` van partij ${c.batch}` : ""}. ${
      basis.charAt(0).toUpperCase() + basis.slice(1)
    }. Bekijk de foto's voor je goedkeurt; goedkeuren rondt de controle af.`,
    dimension: c.submittedAt === null ? "ingestuurd" : `ingestuurd ${when(c.submittedAt, timeZone)}`,
    before: { label: AS_IS, value: `Ingestuurd · ${KIND[c.kind] ?? c.kind} · ${files}` },
    after: { label: AS_DRAWN, value: `Goedgekeurd · controle afgerond · ${c.supplier} hoort het via de link` },
    change: CHANGE,
    witness: c.storeName,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Goedkeuren zoals getekend",
    why: `${c.supplier} stuurde alles wat gevraagd was. ${basis.charAt(0).toUpperCase() + basis.slice(1)}.`,
    evidence: [
      { kind: "quality_check", ref: c.id, summary: `${c.product}: ${files}` },
      { kind: "supplier", ref: c.supplierId, summary: basis }
    ]
  }
}

/* ── drawing ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export const timeZoneOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ timezone: string }>`select timezone from workspaces where id = app_workspace_id()`,
    (rows) => rows[0]?.timezone ?? "Europe/Amsterdam"
  )

/** What the rule draws now for one subject, from the records as they are. */
export const draftFor = Effect.fn("Proposals.draftFor")(
  function*(sql: SqlClient.SqlClient, subjectType: string, subjectId: string) {
    const tz = yield* timeZoneOf(sql)
    if (subjectType === "return") {
      const [r] = yield* returnFacts(sql, [subjectId])
      return r === undefined ? null : drawReturn(r, tz)
    }
    if (subjectType === "quality_check") {
      const [c] = yield* checkFacts(sql, [subjectId])
      return c === undefined ? null : drawCheck(c, tz)
    }
    return null
  }
)

export const insertRevision = (sql: SqlClient.SqlClient, proposalId: string, revision: number, d: Draft) =>
  sql`insert into proposal_revisions (workspace_id, proposal_id, revision, heading, body, dimension, before, after,
                                      change, witness, confidence, confidence_basis, file_label, evidence, why)
      values (app_workspace_id(), ${proposalId}, ${revision}, ${d.heading}, ${d.body}, ${d.dimension},
              ${JSON.stringify(d.before)}::jsonb, ${JSON.stringify(d.after)}::jsonb, ${d.change}, ${d.witness},
              ${d.confidence}, ${d.confidenceBasis}, ${d.fileLabel}, ${JSON.stringify(d.evidence)}::jsonb, ${d.why})`

/** States in which a proposal still stands for its queue row: it is not drawn again for that row. */
const STANDING = ["open", "filed", "executed", "execution_failed", "discarded"]

/**
 * The plates brought in line with the queue's live rows, on the queue's refresh transaction: a row the rule holds for
 * gets one, an open plate whose row resolved or whose rule no longer holds is superseded. A plate set aside, filed or
 * failed stays as it is for its row. Answers whether anything changed.
 */
export const drawIn = Effect.fn("Proposals.drawIn")(function*(sql: SqlClient.SqlClient, rows: ReadonlyArray<Drawable>) {
  let changed = false
  const live = rows.map((r) => r.queueItemId)
  const gone = yield* sql`
    update proposals set state = 'superseded'
    where state = 'open' and origin = 'queue'
      and (queue_item_id is null or not (queue_item_id = any(${live}::text[])))
    returning id`
  if (gone.length > 0) changed = true
  const returns = rows.filter((r) => r.kind === "return_review")
  const checks = rows.filter((r) => r.kind === "quality_review")
  if (returns.length === 0 && checks.length === 0) return changed
  const tz = yield* timeZoneOf(sql)
  const drafts = new Map<string, Draft | null>()
  for (const r of yield* returnFacts(sql, returns.map((x) => x.subjectId))) drafts.set(r.id, drawReturn(r, tz))
  for (const c of yield* checkFacts(sql, checks.map((x) => x.subjectId))) drafts.set(c.id, drawCheck(c, tz))
  const standing = yield* sql<{ id: string; queueItemId: string; state: string }>`
    select id, queue_item_id, state from proposals
    where queue_item_id = any(${[...returns, ...checks].map((r) => r.queueItemId)}::text[])
      and state = any(${STANDING}::text[])`
  for (const row of [...returns, ...checks]) {
    const draft = drafts.get(row.subjectId) ?? null
    const held = standing.filter((s) => s.queueItemId === row.queueItemId)
    const open = held.find((s) => s.state === "open")
    if (open !== undefined) {
      if (draft !== null) continue
      yield* sql`update proposals set state = 'superseded' where id = ${open.id}`
      changed = true
      continue
    }
    if (held.length > 0 || draft === null) continue
    const id = mintId("prp")
    const inserted = yield* sql`
      insert into proposals (id, workspace_id, store_id, origin, queue_item_id, area, subject_type, subject_id, number,
                             action, dedupe_key, expires_at)
      values (${id}, app_workspace_id(), ${draft.storeId}, 'queue', ${row.queueItemId}, ${draft.area},
              ${draft.subjectType}, ${draft.subjectId}, ${draft.number}, ${JSON.stringify(draft.action)}::jsonb,
              ${draft.dedupeKey}, ${draft.expiresAt})
      on conflict do nothing returning id`
    if (inserted.length === 0) continue
    yield* insertRevision(sql, id, 1, draft)
    changed = true
  }
  return changed
})
