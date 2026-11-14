import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { dayOf, type DelayFacts, delayText } from "../../orders/domain/DelayMail.ts"
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
 *   an order delayed             → NotifyDelayedOrder, the shopper's delay mail with the new day where the carrier or
 *                                  the supplier gave one, when there is an address and they were not told yet;
 *                                  confidence from whether there is a new day, and whose
 *   a variant sold out           → CreateSupplierTicket, a ticket to reorder from the product's supplier (Insyte does
 *                                  not order itself yet); confidence from whether there is a supplier taking orders
 *   a chargeback needing evidence → AssembleEvidencePack, Insyte gathering the pack, when none is ready or being
 *                                  gathered; confidence from whether the case names its order (what the pack is made of)
 *   a store without its link     → ReconnectStore, the person sent to Shopify to approve the app again; confidence from
 *                                  whether the store was connected before (a reconnect keeps its records)
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
  /** The row's condition (`stock_out:{variantId}`): a stock-out's variant. */
  readonly dedupeKey: string
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

/* ── delayed orders ───────────────────────────────────────────────────────────────────────────────────────────── */

interface DelayedFacts {
  readonly id: string
  readonly number: string
  readonly status: string
  readonly storeId: string
  readonly storeName: string
  readonly shop: string
  readonly customerName: string
  readonly customerEmail: string | null
  readonly totalMinor: string
  readonly currency: string
  readonly delayedAt: Date | null
  readonly carrierEta: Date | null
  readonly supplierDate: Date | null
  readonly told: boolean
}

const delayedFacts = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([] as ReadonlyArray<DelayedFacts>) : sql<DelayedFacts>`
    select o.id, o.number, o.status, o.store_id, s.name as store_name, coalesce(nullif(s.name, ''), w.name) as shop,
           o.customer_name, nullif(o.customer_email, '') as customer_email, o.total_minor, o.currency, o.delayed_at,
           (select max(d.estimated_delivery) from deliveries d
              where d.order_id = o.id and d.estimated_delivery > now()) as carrier_eta,
           (select max(sw.problem_new_date)::timestamptz from supplier_work sw
              where sw.order_id = o.id and sw.problem_new_date >= current_date) as supplier_date,
           exists (select 1 from order_mails m where m.order_id = o.id and m.kind = 'delay'
                     and m.state in ('scheduled', 'sent')) as told
    from orders o join stores s on s.id = o.store_id join workspaces w on w.id = o.workspace_id
    where o.id in ${sql.in([...ids])}`

const linesOf = (sql: SqlClient.SqlClient, orderIds: ReadonlyArray<string>) =>
  orderIds.length === 0
    ? Effect.succeed(new Map<string, ReadonlyArray<DelayFacts["items"][number]>>())
    : Effect.map(
      sql<{ orderId: string; title: string; variantTitle: string | null; qty: number }>`
        select ol.order_id, coalesce(p.title, ol.title) as title, ol.variant_title, ol.quantity as qty
        from order_lines ol left join products p on p.id = ol.product_id
        where ol.order_id in ${sql.in([...orderIds])} order by ol.id`,
      (rows) => {
        const out = new Map<string, Array<DelayFacts["items"][number]>>()
        for (const r of rows) {
          const variant = r.variantTitle === null || r.variantTitle === "Default Title" ? null : r.variantTitle
          out.set(r.orderId, [...(out.get(r.orderId) ?? []), { title: r.title, variant, qty: r.qty }])
        }
        return out as Map<string, ReadonlyArray<DelayFacts["items"][number]>>
      }
    )

/**
 * A delayed order whose shopper has not been told, with an address to tell them at → NotifyDelayedOrder, the mail
 * written from the order. An order without an address draws nothing: there is no one to mail, and the row is the
 * operator's. How sure: whether there is a new day to give, and whose.
 */
export const drawDelay = (
  o: DelayedFacts,
  items: ReadonlyArray<DelayFacts["items"][number]>,
  timeZone: string
): Draft | null => {
  if (o.delayedAt === null || !["paid", "at_supplier", "shipped"].includes(o.status)) return null
  if (o.customerEmail === null || o.told) return null
  const expectedOn = o.carrierEta ?? o.supplierDate
  const text = delayText({ shop: o.shop, customer: o.customerName, number: o.number, items, expectedOn, timeZone })
  const { confidence, basis } = o.carrierEta !== null
    ? { confidence: 0.9, basis: "nieuwe leverdatum van de vervoerder" }
    : o.supplierDate !== null
    ? { confidence: 0.8, basis: "nieuwe datum van de leverancier" }
    : { confidence: 0.75, basis: "nog geen nieuwe leverdatum bekend" }
  const amount = money(Number(o.totalMinor), o.currency)
  const day = expectedOn === null ? null : dayOf(expectedOn, timeZone)
  return {
    number: o.number,
    storeId: o.storeId,
    area: "orders",
    subjectType: "order",
    subjectId: o.id,
    action: { _tag: "NotifyDelayedOrder", orderId: o.id, subject: text.subject, paragraphs: text.paragraphs },
    dedupeKey: `notify_delay:${o.id}`,
    expiresAt: null,
    heading: `Klant van ${o.number} op de hoogte brengen`,
    body: `Bestelling ${o.number} is vertraagd en ${
      o.customerName || "de klant"
    } weet het nog niet. Getekend: een mail in naam van ${o.shop} ${
      day === null ? "dat er nog geen nieuwe leverdatum is" : `met de nieuwe verwachte leverdatum, ${day}`
    }. De mail gaat pas weg als het ongedaan maken voorbij is.`,
    dimension: `vertraagd sinds ${when(o.delayedAt, timeZone)}`,
    before: { label: AS_IS, value: `Vertraagd · klant nog niet ingelicht · ${amount}` },
    after: { label: AS_DRAWN, value: `Mail aan ${o.customerEmail}: "${text.subject}". ${text.paragraphs[1] ?? ""}` },
    change: CHANGE,
    witness: o.storeName,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Versturen zoals getekend",
    why: `De bestelling is vertraagd en de klant heeft er nog geen mail over gehad. ${
      basis.charAt(0).toUpperCase() + basis.slice(1)
    }.`,
    evidence: [
      { kind: "order", ref: o.id, summary: `${o.number}, ${o.customerName || "klant"}, ${amount}` },
      { kind: "mail", ref: o.customerEmail, summary: [text.subject, ...text.paragraphs].join("\n\n") }
    ]
  }
}

/* ── sold-out variants ────────────────────────────────────────────────────────────────────────────────────────── */

interface SoldOutFacts {
  readonly variantId: string
  readonly productId: string
  readonly storeId: string
  readonly storeName: string
  readonly product: string
  readonly variant: string
  readonly fromAt: Date
  readonly supplierId: string | null
  readonly supplier: string | null
  readonly paused: boolean
  readonly leadDays: number | null
  readonly sold: number
}

const soldOutFacts = (sql: SqlClient.SqlClient, variantIds: ReadonlyArray<string>) =>
  variantIds.length === 0 ? Effect.succeed([] as ReadonlyArray<SoldOutFacts>) : sql<SoldOutFacts>`
    select st.variant_id, st.product_id, st.store_id, s.name as store_name, p.title as product, v.title as variant,
           st.from_at, su.id as supplier_id, su.name as supplier, su.paused_at is not null as paused, ps.lead_days,
           (select coalesce(sum(ol.quantity), 0) from order_lines ol join orders o on o.id = ol.order_id
              where ol.variant_id = st.variant_id and o.placed_at > now() - interval '30 days')::int as sold
    from stockouts st join products p on p.id = st.product_id join variants v on v.id = st.variant_id
    join stores s on s.id = st.store_id
    left join product_supply ps on ps.product_id = st.product_id and ps.is_primary
    left join suppliers su on su.id = ps.supplier_id and su.deleted_at is null
    where st.variant_id in ${sql.in([...variantIds])} and st.to_at is null`

/** The stock-out row's variant: its dedupe key is `stock_out:{variantId}`. */
export const variantOf = (dedupeKey: string) => dedupeKey.slice(dedupeKey.indexOf(":") + 1)

/**
 * A variant sold out → CreateSupplierTicket, a ticket for the filer to reorder from the product's supplier: Insyte does
 * not order from suppliers itself yet. Without a supplier, the ticket asks for one first and the plate says so. How
 * sure: whether there is a supplier to order from, and whether it is taking orders.
 */
export const drawReorder = (s: SoldOutFacts, timeZone: string): Draft => {
  const name = `${s.product}${s.variant === "Default Title" ? "" : ` · ${s.variant}`}`
  const sold = s.sold === 0 ? "" : ` In de laatste 30 dagen gingen er ${s.sold} over de toonbank.`
  const since = when(s.fromAt, timeZone)
  const { confidence, basis } = s.supplier === null
    ? { confidence: 0.6, basis: "geen leverancier aan het product gekoppeld" }
    : s.paused
    ? { confidence: 0.7, basis: `${s.supplier} staat op pauze` }
    : { confidence: 0.9, basis: `${s.supplier} is de vaste leverancier van dit product` }
  const title = s.supplier === null
    ? `Leverancier kiezen en bijbestellen: ${name}`
    : `Bijbestellen bij ${s.supplier}: ${name}`
  const description = [
    `${name} is uitverkocht sinds ${since}.${sold}`,
    s.supplier === null
      ? "Er is nog geen leverancier aan dit product gekoppeld. Kies er een en bestel bij."
      : `Bestel bij ${s.supplier}${
        s.leadDays === null ? "" : ` (levertijd ${s.leadDays} ${s.leadDays === 1 ? "dag" : "dagen"})`
      }.`,
    "Getekend door Insyte vanuit Start."
  ].join("\n\n")
  return {
    number: name,
    storeId: s.storeId,
    area: "products",
    subjectType: "product",
    subjectId: s.productId,
    action: { _tag: "CreateSupplierTicket", supplierId: s.supplierId, productId: s.productId, title, description },
    dedupeKey: `reorder:${s.variantId}`,
    expiresAt: null,
    heading: s.supplier === null ? `${name} bijbestellen` : `${name} bijbestellen bij ${s.supplier}`,
    body: `${name} is uitverkocht sinds ${since}.${sold} ${
      s.supplier === null
        ? "Er is geen leverancier aan dit product gekoppeld, dus het ticket vraagt eerst er een te kiezen."
        : `Getekend: een ticket voor jou om bij ${s.supplier} bij te bestellen.`
    } Insyte bestelt zelf nog niet bij leveranciers.`,
    dimension: `uitverkocht sinds ${since}`,
    before: { label: AS_IS, value: `Uitverkocht · ${s.supplier ?? "geen leverancier"}` },
    after: { label: AS_DRAWN, value: `Ticket "${title}" · hoge prioriteit · Leveringsketen · aan jou toegewezen` },
    change: CHANGE,
    witness: s.storeName,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Ticket openen zoals getekend",
    why: `De variant is uitverkocht en het product is actief. ${basis.charAt(0).toUpperCase() + basis.slice(1)}.`,
    evidence: [
      { kind: "product", ref: s.productId, summary: `${name}, ${s.sold} verkocht in 30 dagen` },
      ...(s.supplierId === null ? [] : [{ kind: "supplier", ref: s.supplierId, summary: basis }])
    ]
  }
}

/* ── chargebacks ──────────────────────────────────────────────────────────────────────────────────────────── */

interface CaseFacts {
  readonly id: string
  readonly caseNumber: string
  readonly status: string
  readonly storeId: string | null
  readonly storeName: string
  readonly customerName: string
  readonly amountMinor: string
  readonly currency: string
  readonly deadlineAt: Date
  readonly orderId: string | null
  readonly orderNumber: string | null
  readonly items: number
  readonly packState: string | null
  readonly packFresh: boolean
}

const caseFacts = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([] as ReadonlyArray<CaseFacts>) : sql<CaseFacts>`
    select c.id, c.case_number, c.status, c.store_id, coalesce(s.name, w.name) as store_name, c.customer_name,
           c.amount_minor, c.currency, c.deadline_at, c.order_id, o.number as order_number,
           (select count(*) from evidence_items e
              where e.chargeback_id = c.id and e.removed_at is null and e.included)::int as items,
           p.state as pack_state, coalesce(p.started_at > now() - interval '15 minutes', false) as pack_fresh
    from chargebacks c join workspaces w on w.id = c.workspace_id left join stores s on s.id = c.store_id
    left join orders o on o.id = c.order_id left join evidence_packs p on p.chargeback_id = c.id
    where c.id in ${sql.in([...ids])}`

/**
 * A chargeback that needs evidence, with no pack ready or being gathered → AssembleEvidencePack, Insyte gathering what
 * the case rests on (the order, its parcels, the mails, the policy). The plate lapses with the deadline. How sure:
 * whether the case names its order, which is what most of the pack is made of.
 */
export const drawEvidence = (c: CaseFacts, timeZone: string): Draft | null => {
  if (c.status !== "open" && c.status !== "awaiting_evidence") return null
  if (c.packState === "ready" || c.packState === "submitted" || (c.packState === "assembling" && c.packFresh)) {
    return null
  }
  const amount = money(Number(c.amountMinor), c.currency.trim())
  const { confidence, basis } = c.orderNumber === null
    ? { confidence: 0.6, basis: "geen bestelling aan de zaak gekoppeld" }
    : { confidence: 0.9, basis: `bestelling ${c.orderNumber} is aan de zaak gekoppeld` }
  const held = c.items === 0 ? "nog geen bewijs" : `${c.items} ${c.items === 1 ? "stuk" : "stukken"} bewijs`
  return {
    number: c.caseNumber,
    storeId: c.storeId,
    area: "chargebacks",
    subjectType: "chargeback",
    subjectId: c.id,
    action: { _tag: "AssembleEvidencePack", chargebackId: c.id },
    dedupeKey: `evidence_pack:${c.id}`,
    expiresAt: c.deadlineAt,
    heading: `Bewijspakket voor ${c.caseNumber} klaarzetten`,
    body: `Chargeback ${c.caseNumber} van ${c.customerName} (${amount}) moet uiterlijk ${
      when(c.deadlineAt, timeZone)
    } beantwoord zijn. Getekend: Insyte verzamelt het bewijs${
      c.orderNumber === null ? "" : ` bij bestelling ${c.orderNumber}`
    } en zet het pakket klaar. Je bekijkt het en dient het zelf in.`,
    dimension: `deadline ${when(c.deadlineAt, timeZone)}`,
    before: { label: AS_IS, value: `Wacht op bewijs · ${held} · ${amount}` },
    after: { label: AS_DRAWN, value: "Bewijspakket verzameld door Insyte, klaar om na te kijken" },
    change: CHANGE,
    witness: c.storeName,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Pakket laten verzamelen",
    why: `De zaak wacht op bewijs en er is nog geen pakket klaar. ${basis.charAt(0).toUpperCase() + basis.slice(1)}.`,
    evidence: [
      { kind: "chargeback", ref: c.id, summary: `${c.caseNumber}, ${c.customerName}, ${amount}` },
      ...(c.orderId === null || c.orderNumber === null
        ? []
        : [{ kind: "order", ref: c.orderId, summary: c.orderNumber }])
    ]
  }
}

/* ── stores ───────────────────────────────────────────────────────────────────────────────────────────────── */

interface StoreFacts {
  readonly id: string
  readonly name: string
  readonly shopDomain: string
  readonly status: string
  readonly disconnectedAt: Date | null
  readonly hasOrders: boolean
}

const storeFacts = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  ids.length === 0 ? Effect.succeed([] as ReadonlyArray<StoreFacts>) : sql<StoreFacts>`
    select s.id, s.name, s.shop_domain, s.status, s.disconnected_at,
           exists (select 1 from orders o where o.store_id = s.id) as has_orders
    from stores s where s.id in ${sql.in([...ids])}`

/**
 * A store that lost its link → ReconnectStore: the person approves the app at Shopify again, and the store keeps its id
 * and its records. How sure: whether Insyte already holds the store's orders (a reconnect, not a first connect).
 */
export const drawReconnect = (s: StoreFacts, timeZone: string): Draft | null => {
  if (s.status !== "disconnected" && s.status !== "action_required") return null
  const { confidence, basis } = s.hasOrders
    ? { confidence: 0.9, basis: "Insyte heeft de bestellingen van de winkel al; opnieuw koppelen houdt ze" }
    : { confidence: 0.75, basis: "de winkel heeft nog geen bestellingen in Insyte" }
  const since = s.disconnectedAt === null ? null : when(s.disconnectedAt, timeZone)
  return {
    number: s.name,
    storeId: s.id,
    area: "settings",
    subjectType: "store",
    subjectId: s.id,
    action: { _tag: "ReconnectStore", storeId: s.id, shopDomain: s.shopDomain },
    dedupeKey: `reconnect:${s.id}`,
    expiresAt: null,
    heading: `${s.name} opnieuw koppelen`,
    body: `${s.name} is ${
      since === null ? "niet meer gekoppeld" : `sinds ${since} niet meer gekoppeld`
    }: bestellingen, voorraad en klanten komen niet binnen. Getekend: je gaat naar Shopify en keurt Insyte opnieuw goed voor ${s.shopDomain}. Daarna loopt de winkel weer bij.`,
    dimension: since === null ? "niet gekoppeld" : `niet gekoppeld sinds ${since}`,
    before: { label: AS_IS, value: `Niet gekoppeld · ${s.shopDomain}` },
    after: { label: AS_DRAWN, value: "Gekoppeld, de winkel loopt bij" },
    change: CHANGE,
    witness: s.name,
    confidence,
    confidenceBasis: basis,
    fileLabel: "Opnieuw koppelen bij Shopify",
    why: `De winkel heeft zijn koppeling verloren. ${basis.charAt(0).toUpperCase() + basis.slice(1)}.`,
    evidence: [{ kind: "store", ref: s.id, summary: `${s.name}, ${s.shopDomain}` }]
  }
}

/* ── drawing ──────────────────────────────────────────────────────────────────────────────────────────────────── */

export const timeZoneOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ timezone: string }>`select timezone from workspaces where id = app_workspace_id()`,
    (rows) => rows[0]?.timezone ?? "Europe/Amsterdam"
  )

/** What the rule draws now for one subject, from the records as they are; `dedupeKey` names a stock-out's variant. */
export const draftFor = Effect.fn("Proposals.draftFor")(
  function*(sql: SqlClient.SqlClient, subjectType: string, subjectId: string, dedupeKey: string) {
    const tz = yield* timeZoneOf(sql)
    if (subjectType === "return") {
      const [r] = yield* returnFacts(sql, [subjectId])
      return r === undefined ? null : drawReturn(r, tz)
    }
    if (subjectType === "quality_check") {
      const [c] = yield* checkFacts(sql, [subjectId])
      return c === undefined ? null : drawCheck(c, tz)
    }
    if (subjectType === "order") {
      const [o] = yield* delayedFacts(sql, [subjectId])
      return o === undefined ? null : drawDelay(o, (yield* linesOf(sql, [subjectId])).get(subjectId) ?? [], tz)
    }
    if (subjectType === "product") {
      const [s] = yield* soldOutFacts(sql, [variantOf(dedupeKey)])
      return s === undefined ? null : drawReorder(s, tz)
    }
    if (subjectType === "chargeback") {
      const [c] = yield* caseFacts(sql, [subjectId])
      return c === undefined ? null : drawEvidence(c, tz)
    }
    if (subjectType === "store") {
      const [s] = yield* storeFacts(sql, [subjectId])
      return s === undefined ? null : drawReconnect(s, tz)
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

/**
 * States in which a proposal still stands for its queue row: it is not drawn again for that row. A plate that expired
 * with its deadline is not drawn again either: the deadline is past.
 */
const STANDING = ["open", "filed", "executed", "execution_failed", "discarded", "expired"]

/**
 * A hand-off that leaves the work with the person elsewhere ("Opnieuw koppelen bij Shopify") stands this long: when the
 * store is still not connected by then, the person did not finish at Shopify, and the row gets a fresh plate.
 */
const HANDOFF_STANDS_MINUTES = 60

/** The queue kinds a plate is drawn for, and the record each one's drawing reads. */
const DRAWN_FOR: ReadonlySet<string> = new Set([
  "return_review",
  "quality_review",
  "order_delayed",
  "stock_out",
  "chargeback_deadline",
  "chargeback_opened",
  "store_disconnected"
])

/**
 * The plates brought in line with the queue's live rows, on the queue's refresh transaction: a row the rule holds for
 * gets one; an open plate whose row resolved or whose rule no longer holds is superseded, and one past its deadline
 * expires. A plate set aside, filed or failed stays as it is for its row (a failed one is superseded once its row is
 * gone), but a hand-off to Shopify only for `HANDOFF_STANDS_MINUTES`. Answers whether anything changed.
 */
export const drawIn = Effect.fn("Proposals.drawIn")(function*(sql: SqlClient.SqlClient, rows: ReadonlyArray<Drawable>) {
  let changed = false
  const live = rows.map((r) => r.queueItemId)
  const gone = yield* sql`
    update proposals set state = 'superseded'
    where state in ('open', 'execution_failed') and origin = 'queue'
      and (queue_item_id is null or not (queue_item_id = any(${live}::text[])))
    returning id`
  if (gone.length > 0) changed = true
  const expired = yield* sql`
    update proposals set state = 'expired' where state = 'open' and expires_at <= now() returning id`
  if (expired.length > 0) changed = true
  const drawable = rows.filter((r) => DRAWN_FOR.has(r.kind))
  if (drawable.length === 0) return changed
  const tz = yield* timeZoneOf(sql)
  const of = (kind: string) => drawable.filter((r) => r.kind === kind)
  // Each row's drawing, by row: what the rule draws from its record now, or `null` where it holds for none.
  const drafts = new Map<string, Draft | null>()
  const bySubject = (kind: string, key: (r: Drawable) => string) =>
    new Map(of(kind).map((r) => [key(r), r.queueItemId]))
  const returns = bySubject("return_review", (r) => r.subjectId)
  for (const r of yield* returnFacts(sql, [...returns.keys()])) drafts.set(returns.get(r.id)!, drawReturn(r, tz))
  const checks = bySubject("quality_review", (r) => r.subjectId)
  for (const c of yield* checkFacts(sql, [...checks.keys()])) drafts.set(checks.get(c.id)!, drawCheck(c, tz))
  const delayed = bySubject("order_delayed", (r) => r.subjectId)
  const lines = yield* linesOf(sql, [...delayed.keys()])
  for (const o of yield* delayedFacts(sql, [...delayed.keys()])) {
    drafts.set(delayed.get(o.id)!, drawDelay(o, lines.get(o.id) ?? [], tz))
  }
  const soldOut = bySubject("stock_out", (r) => variantOf(r.dedupeKey))
  for (const s of yield* soldOutFacts(sql, [...soldOut.keys()])) {
    drafts.set(soldOut.get(s.variantId)!, drawReorder(s, tz))
  }
  const cases = new Map(
    [...of("chargeback_deadline"), ...of("chargeback_opened")].map((r) => [r.subjectId, r.queueItemId])
  )
  for (const c of yield* caseFacts(sql, [...cases.keys()])) drafts.set(cases.get(c.id)!, drawEvidence(c, tz))
  const unlinked = bySubject("store_disconnected", (r) => r.subjectId)
  for (const s of yield* storeFacts(sql, [...unlinked.keys()])) drafts.set(unlinked.get(s.id)!, drawReconnect(s, tz))
  const standing = yield* sql<{ id: string; queueItemId: string; state: string }>`
    select id, queue_item_id, state from proposals
    where queue_item_id = any(${drawable.map((r) => r.queueItemId)}::text[])
      and state = any(${STANDING}::text[])
      and not (state = 'executed' and action ->> '_tag' = 'ReconnectStore'
               and executed_at < now() - make_interval(mins => ${HANDOFF_STANDS_MINUTES}))`
  for (const row of drawable) {
    const draft = drafts.get(row.queueItemId) ?? null
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
