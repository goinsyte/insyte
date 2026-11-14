import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import type { ActInput, Did } from "@insyte/modules/automations/Links"
import { ETA_BASIS, etaOf } from "@insyte/modules/automations/use-cases/context"
import { explain, StepFailed } from "@insyte/modules/automations/use-cases/engine"
import { conversationOf } from "@insyte/modules/chats/use-cases/chats"
import { post } from "@insyte/modules/chats/use-cases/commands"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { refundOn } from "@insyte/modules/orders/use-cases/refund"
import { PendingEvents } from "@insyte/modules/shared/domain/Outbox"
import { inScope } from "@insyte/modules/shared/use-cases/StoreScope"
import { fromMinor, toMinor } from "@insyte/modules/stores/domain/Mirror"
import { Tracking } from "@insyte/modules/tracking/domain/Tracking"
import { ingest } from "@insyte/modules/tracking/use-cases/tracking"
import { Effect, Option } from "effect"
import type { SqlClient } from "effect/sql"
import { withAi } from "../Ai.ts"

/*
 * A flow's actions through the slices that own them (M12 step 3; `AutomationActions`), loaded on the first such step
 * an isolate runs (`AutomationActions.ts`), so the jobs Worker starts without them. Each acts as the flow's service
 * account and says what it did, or fails the step with why (`StepFailed`, terminal when trying again gives the same
 * answer).
 */

/**
 * A flow refunds at most this much per order, in the workspace's currency, summed over every flow's refunds on it, and
 * never more than its owner, its version's publisher or the one who started the run may refund themselves: money goes
 * out without anyone looking, so the safest default holds it to a small amount (Beslissen in the PR).
 */
export const FLOW_REFUND_CAP = 100

/** Currencies with three decimals: Insyte's minor units have two, so a flow does not refund in them. */
const THREE_DECIMALS = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"])

const SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥" }

/** `500` in EUR → "€ 5,00". */
const money = (minor: number, currency: string) => {
  const digits = toMinor("1", currency) === 1 ? 0 : 2
  const amount = Number(fromMinor(minor, currency))
  const text = amount.toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${SYMBOL[currency.toUpperCase()] ?? currency.toUpperCase()} ${text}`
}

const fail = (explanation: string, terminal = true) => Effect.fail(new StepFailed({ explanation, terminal }))

/** The run's order, or the step cannot do anything: a mail or a stock run has none. */
const orderOf = (input: ActInput) =>
  input.plan.orderId === null
    ? fail("Deze run gaat niet over een bestelling, dus deze stap kan niets doen.")
    : Effect.succeed(input.plan.orderId)

/** "volledig" (or nothing) is what is left on the order; "25,00" and "€ 25" are amounts in its currency. */
const amountOf = (text: string, currency: string): "full" | number | undefined => {
  const t = text.trim().toLowerCase()
  if (t === "" || t === "volledig" || t === "alles" || t === "full") return "full"
  const cleaned = t.replace(/[€$£¥\s]/g, "")
  const normal = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return undefined
  const minor = toMinor(normal, currency)
  return Number.isFinite(minor) && minor > 0 ? minor : undefined
}

const CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"

/**
 * The refund's id for this run's step: the same every attempt, so a second attempt that gets through finds the first's
 * refund (`refundOn` answers it) instead of refunding again.
 */
const refundIdOf = (runId: string, nodeId: string) =>
  Effect.map(
    Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(`automation:${runId}:${nodeId}`))),
    (digest) => {
      let value = 0n
      for (const byte of new Uint8Array(digest).slice(0, 17)) value = (value << 8n) | BigInt(byte)
      let out = ""
      for (let i = 0; i < 26; i++) {
        out = CROCKFORD[Number(value & 31n)] + out
        value >>= 5n
      }
      return `rfd_${out}`
    }
  )

/** A member's or the run's starter's own refund right: their limit per order (0: none) and the stores they reach. */
interface Authority {
  readonly limitMinor: number
  readonly stores: ReadonlyArray<string> | null
}

type StoreAccess = "all" | ReadonlyArray<string>

/** The member's stores narrow the role's (as `memberships` reads them); `null` is every store. */
const storesOf = (role: StoreAccess, member: StoreAccess): ReadonlyArray<string> | null =>
  role === "all" ? (member === "all" ? null : member) : member === "all" ? role : member.filter((s) => role.includes(s))

/**
 * What the flow's owner and the publisher of the run's version may refund themselves, as they are now: an active member
 * at Bestellingen · Bewerken with Terugbetalen (the workspace's owner always), within their role's limit. One who is
 * gone, deactivated or without the right gives none.
 */
const peopleOf = Effect.fn("AutomationActs.peopleOf")(function*(
  sql: SqlClient.SqlClient,
  plan: ActInput["plan"],
  capMinor: number
) {
  const rows = yield* sql<{
    who: "owner" | "publisher"
    roleId: string
    limitMinor: string | null
    may: boolean
    orders: number
    roleStores: StoreAccess
    memberStores: StoreAccess
  }>`
    select p.who, r.id as role_id, r.refund_limit_minor as limit_minor,
           coalesce((r.specials ->> 'refunds.write')::boolean, false) as may,
           coalesce((r.levels ->> 'orders')::int, 0) as orders, r.stores as role_stores, m.stores as member_stores
    from (
      select 'owner' as who, a.owner_member_id as member_id from automations a where a.id = ${plan.automationId}
      union all
      select 'publisher', v.published_by from automation_versions v
      where v.automation_id = ${plan.automationId} and v.version = ${plan.version}
    ) p
    join members m on m.id = p.member_id and m.deactivated_at is null and m.removed_at is null
    join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id`
  const of = (who: "owner" | "publisher"): Authority => {
    const p = rows.find((r) => r.who === who)
    if (p === undefined) return { limitMinor: 0, stores: [] }
    return { limitMinor: roleLimit(p, capMinor), stores: storesOf(p.roleStores, p.memberStores) }
  }
  return { owner: of("owner"), publisher: of("publisher") }
})

/** A role's own refund right: none without Bestellingen · Bewerken and Terugbetalen; the owner's is the cap. */
const roleLimit = (
  r: { readonly roleId: string; readonly may: boolean; readonly orders: number; readonly limitMinor: string | null },
  capMinor: number
) =>
  r.roleId === "owner"
    ? capMinor
    : !r.may || r.orders < 2
    ? 0
    : r.limitMinor === null
    ? capMinor
    : Math.min(capMinor, Number(r.limitMinor))

interface RoleRow {
  readonly roleId: string
  readonly limitMinor: string | null
  readonly may: boolean
  readonly orders: number
}

/**
 * Who started the run by hand (`automation_runs.started_by`), and what they may refund: no more than they could when
 * they started it (the run keeps that), and no more than they can now. A member since deactivated or removed, or a key
 * since revoked, expired or whose maker is gone, gives none. A trigger's run has no starter.
 */
const starterOf = Effect.fn("AutomationActs.starterOf")(function*(
  sql: SqlClient.SqlClient,
  runId: string,
  capMinor: number
) {
  const [run] = yield* sql<{
    startedBy: string | null
    starterRefundMinor: string | null
    starterStores: Array<string> | null
  }>`select started_by, starter_refund_minor, starter_stores from automation_runs where id = ${runId}`
  if (run === undefined || run.startedBy === null) return undefined
  const then = run.starterRefundMinor === null ? capMinor : Math.min(capMinor, Number(run.starterRefundMinor))
  const now = run.startedBy.startsWith("mem_")
    ? yield* Effect.map(
      sql<RoleRow>`
        select r.id as role_id, r.refund_limit_minor as limit_minor,
               coalesce((r.specials ->> 'refunds.write')::boolean, false) as may,
               coalesce((r.levels ->> 'orders')::int, 0) as orders
        from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
        where m.id = ${run.startedBy} and m.deactivated_at is null and m.removed_at is null`,
      ([r]) => (r === undefined ? 0 : roleLimit(r, capMinor))
    )
    : yield* Effect.map(
      sql<RoleRow & { kind: string }>`
        select k.access ->> 'kind' as kind, r.id as role_id, r.refund_limit_minor as limit_minor,
               coalesce((r.specials ->> 'refunds.write')::boolean, false) as may,
               coalesce((r.levels ->> 'orders')::int, 0) as orders
        from api_keys k
        join members m on m.id = k.created_by and m.deactivated_at is null and m.removed_at is null
        left join roles r on r.workspace_id = k.workspace_id and r.id = k.access ->> 'roleId'
        where k.id = ${run.startedBy} and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())`,
      ([k]) =>
        k === undefined
          ? 0
          : k.kind !== "role"
          ? capMinor
          : k.roleId === null
          ? 0
          : roleLimit(k, capMinor)
    )
  return { limitMinor: Math.min(then, now), stores: run.starterStores } satisfies Authority
})

/**
 * What the flow may refund on this order, or why it may not: the lowest of `FLOW_REFUND_CAP` and the limits of its
 * owner, its version's publisher and the run's starter, and only in a store each of them reaches.
 */
const limitOf = Effect.fn("AutomationActs.limitOf")(function*(
  sql: SqlClient.SqlClient,
  plan: ActInput["plan"],
  storeId: string,
  capMinor: number
) {
  const { owner, publisher } = yield* peopleOf(sql, plan, capMinor)
  const starter = yield* starterOf(sql, plan.runId, capMinor)
  const reaches = (a: Authority) => a.stores === null || a.stores.includes(storeId)
  const checks: ReadonlyArray<readonly [Authority | undefined, string, string]> = [
    [
      owner,
      "De eigenaar van de flow mag zelf niet terugbetalen, dus de flow ook niet. Geef de flow een eigenaar met het recht Terugbetalen.",
      "De eigenaar van de flow kan niet bij de winkel van deze bestelling, dus de flow betaalt hier niet terug."
    ],
    [
      publisher,
      "Wie deze versie publiceerde, mag zelf niet terugbetalen, dus de flow ook niet. Laat iemand met het recht Terugbetalen hem publiceren.",
      "Wie deze versie publiceerde, kan niet bij de winkel van deze bestelling, dus de flow betaalt hier niet terug."
    ],
    [
      starter,
      "Wie deze run startte, mag zelf niet (meer) terugbetalen; er is niets terugbetaald.",
      "Wie deze run startte, kan niet bij de winkel van deze bestelling; er is niets terugbetaald."
    ]
  ]
  let limitMinor = capMinor
  for (const [a, none, elsewhere] of checks) {
    if (a === undefined) continue
    if (a.limitMinor <= 0) return { refused: none } as const
    if (!reaches(a)) return { refused: elsewhere } as const
    limitMinor = Math.min(limitMinor, a.limitMinor)
  }
  return { limitMinor } as const
})

/** Suppliers by the names a step gives ("Yiwu Trading, Atelier Noord"), case aside. */
const suppliersNamed = (sql: SqlClient.SqlClient, names: ReadonlyArray<string>) =>
  sql<{ id: string; name: string; paused: boolean }>`
    select id, name, paused_at is not null as paused from suppliers
    where deleted_at is null and lower(name) in ${sql.in(names.map((n) => n.toLowerCase()))}`

const namesIn = (text: string) => [...new Set(text.split(/\s*,\s*/).map((n) => n.trim()).filter((n) => n !== ""))]

/** The step's `{{subject}}` for an AI step: the run's thread, else the newest open ticket about its order. */
const aiSubjectOf = Effect.fn("AutomationActs.aiSubjectOf")(function*(sql: SqlClient.SqlClient, input: ActInput) {
  if (input.plan.threadId !== null) return { type: "thread" as const, id: input.plan.threadId }
  if (input.plan.orderId === null) return undefined
  const [ticket] = yield* sql<{ id: string }>`
    select t.id from tickets t
    where t.related_type = 'order' and t.related_id = ${input.plan.orderId} and t.deleted_at is null
      and t.status <> 'done'
    order by t.created_at desc limit 1`
  if (ticket !== undefined) return { type: "ticket" as const, id: ticket.id }
  const [thread] = input.plan.customerId === null ? [] : yield* sql<{ id: string }>`
    select id from email_threads where customer_id = ${input.plan.customerId}
    order by last_message_at desc limit 1`
  return thread === undefined ? undefined : { type: "thread" as const, id: thread.id }
})

/** Insyte AI's refusal, said: the month's budget spent, no model set up, or the subject gone. */
const aiRefused = (error: unknown) => {
  const tag = (error as { _tag?: string })._tag ?? ""
  return tag === "BudgetExceeded"
    ? fail("Het AI-budget van deze maand is op; de stap is niet gedaan. Verhoog het bij Instellingen › Insyte AI.")
    : tag === "ModelUnavailable"
    ? fail("Insyte AI staat hier nog niet aan; de stap is niet gedaan.")
    : tag === "Forbidden"
    ? fail("De flow mist het recht “AI laten opstellen”. Zet het aan bij Instellingen.")
    : tag === "NotFound"
    ? fail("Het gesprek of ticket van deze run bestaat niet meer.")
    : tag === "Invalid"
    ? fail("Er is nog niets van de klant om op te antwoorden.")
    : fail("Insyte AI gaf geen antwoord; Insyte probeert het opnieuw.", false)
}

/** One action, as the account in `input.principal`. */
export const act = (input: ActInput): Effect.Effect<Did, StepFailed, Db> => {
  const p: Principal = input.principal
  const asAccount = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(CurrentPrincipal, p),
      Effect.provideService(CurrentWorkspace, { id: p.workspaceId as WorkspaceId })
    )
  const scoped = <A, E, R>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
    asAccount(Effect.flatMap(Effect.service(Db), (db) => db.scoped(f)))
  const refused = (error: unknown) => Effect.fail(explain(input.node.variantId, error))
  const forbidden = () => refused({ _tag: "Forbidden" })

  const run: Effect.Effect<Did, unknown, Db> = Effect.gen(function*() {
    switch (input.node.variantId) {
      /* Leverancier berichten: a message in each named supplier's shared channel, which the supplier reads too. */
      case "action.notify_supplier": {
        if (p.role.levels.suppliers < 2) return yield* forbidden()
        const names = namesIn(input.text("supplier"))
        if (names.length === 0) return yield* fail("Deze run noemt geen leverancier om te berichten.")
        const body = input.text("message") || "Kun je de verzending bevestigen?"
        return yield* scoped((sql) =>
          Effect.gen(function*() {
            const found = yield* suppliersNamed(sql, names)
            const missing = names.filter((n) => !found.some((s) => s.name.toLowerCase() === n.toLowerCase()))
            if (missing.length > 0) return yield* fail(`Er is geen leverancier “${missing.join("”, “")}”.`)
            const posted: Array<string> = []
            for (const s of found) {
              const [channel] = yield* sql<{ id: string }>`
                select id from conversations where supplier_id = ${s.id} and kind = 'supplier_channel'
                  and archived_at is null`
              if (channel === undefined) {
                return yield* fail(
                  `${s.name} heeft nog geen kanaal. Open het bij Chats › Leveranciers en probeer opnieuw.`
                )
              }
              const c = yield* conversationOf(sql, channel.id)
              const records = input.plan.orderId === null ? [] : [{ kind: "order", id: input.plan.orderId }]
              posted.push(
                yield* post(sql, c, {
                  body: `${body}\n\n— automatisering “${input.plan.name}”`,
                  mentions: [],
                  records,
                  replyTo: null,
                  alsoInChannel: false
                })
              )
            }
            return {
              status: "succeeded" as const,
              output: { messageIds: posted, suppliers: found.map((s) => s.id) },
              explanation: `Bericht gestuurd aan ${found.map((s) => s.name).join(", ")}.`
            }
          })
        )
      }

      /*
       * Terugbetalen: within the flow's limit and what is left on the order, audited as the flow's account. The order is
       * locked in a statement of its own, and only then are its refunds read: a statement that waited for the lock
       * still sees the rows as they were when it began, so reading them in the same statement would miss a refund
       * another flow committed meanwhile. Two steps, runs or flows refunding the order at once are so counted one
       * after the other, and what flows refunded on it before counts against the limit too.
       */
      case "action.refund": {
        if (p.role.levels.orders < 2 || !p.role.specials["refunds.write"]) return yield* forbidden()
        const orderId = yield* orderOf(input)
        const refundId = yield* refundIdOf(input.plan.runId, input.node.id)
        return yield* scoped((sql) =>
          Effect.gen(function*() {
            const scope = yield* inScope(sql, "o.store_id")
            const [locked] = yield* sql<{ id: string }>`
              select o.id from orders o where o.id = ${orderId} and ${scope} for update of o`
            if (locked === undefined) return yield* refused({ _tag: "NotFound" })
            const [o] = yield* sql<{
              storeId: string
              currency: string
              workspaceCurrency: string
              balanceMinor: string
              byFlowsMinor: string
              asked: boolean
            }>`
              select o.store_id, o.currency, w.currency as workspace_currency,
                     o.total_minor - coalesce((select sum(r.amount_minor) from refunds r
                                               where r.order_id = o.id and r.status <> 'failed'), 0) as balance_minor,
                     coalesce((select sum(r.amount_minor) from refunds r
                               where r.order_id = o.id and r.status <> 'failed' and r.created_by like 'sa\\_%'), 0)
                       as by_flows_minor,
                     exists (select 1 from refunds r where r.id = ${refundId}) as asked
              from orders o join workspaces w on w.id = o.workspace_id
              where o.id = ${orderId}`
            if (o === undefined) return yield* refused({ _tag: "NotFound" })
            const currency = o.currency.trim().toUpperCase()
            const reason = input.text("reason")
            const note = `${reason === "" ? "Terugbetaald" : reason} · automatisering “${input.plan.name}”`
            const account = (limitMinor: number) => ({ ...p, role: { ...p.role, refundLimit: limitMinor / 100 } })
            if (o.asked) {
              // An attempt before this one refunded: the same refund, answered again.
              const [earlier] = yield* sql<{ amountMinor: string }>`
                select amount_minor from refunds where id = ${refundId}`
              const amountMinor = Number(earlier?.amountMinor ?? 0)
              return {
                status: "succeeded" as const,
                output: { refundId, amountMinor },
                explanation: `${money(amountMinor, currency)} terugbetaald; Shopify verwerkt het.`
              }
            }
            if (currency !== o.workspaceCurrency.trim().toUpperCase() || THREE_DECIMALS.has(currency)) {
              return yield* fail(
                `Deze bestelling is in ${currency}; een flow betaalt alleen terug in ${o.workspaceCurrency.trim()}. Doe het zelf.`
              )
            }
            const asked = amountOf(input.text("amount"), currency)
            if (asked === undefined) {
              return yield* fail(`“${input.text("amount")}” is geen bedrag; schrijf “volledig” of “25,00”.`)
            }
            const capMinor = toMinor(String(FLOW_REFUND_CAP), currency)
            const limit = yield* limitOf(sql, input.plan, o.storeId, capMinor)
            if ("refused" in limit) return yield* fail(limit.refused)
            const balance = Number(o.balanceMinor)
            const amountMinor = asked === "full" ? balance : asked
            if (amountMinor <= 0) return yield* fail("De bestelling is al volledig terugbetaald.")
            if (amountMinor > limit.limitMinor) {
              return yield* fail(
                `${money(amountMinor, currency)} is meer dan de flow per bestelling mag terugbetalen (${
                  money(limit.limitMinor, currency)
                }). Doe het zelf, of vraag eerst goedkeuring.`
              )
            }
            const byFlows = Number(o.byFlowsMinor)
            if (byFlows + amountMinor > limit.limitMinor) {
              return yield* fail(
                `Flows betaalden op deze bestelling al ${money(byFlows, currency)} terug; met ${
                  money(amountMinor, currency)
                } erbij is het meer dan flows per bestelling mogen (${
                  money(limit.limitMinor, currency)
                }). Doe het zelf, of vraag eerst goedkeuring.`
              )
            }
            const done = yield* refundOn(sql, { id: orderId, refundId: refundId as never, amountMinor, note }).pipe(
              Effect.provideService(CurrentPrincipal, account(limit.limitMinor))
            )
            if (done.outboxId !== null) (yield* PendingEvents)?.add(done.outboxId)
            return {
              status: "succeeded" as const,
              output: { refundId: done.result.refundId, amountMinor },
              explanation: `${money(amountMinor, currency)} terugbetaald; Shopify verwerkt het.`
            }
          })
        )
      }

      /* Leverancier toewijzen: the order's legs not yet sent go to the named supplier ("Andere leverancier"). */
      case "action.assign_supplier": {
        const orderId = yield* orderOf(input)
        const [name] = namesIn(input.text("supplier"))
        if (name === undefined) return yield* fail("De stap noemt geen leverancier.")
        const plan = yield* scoped((sql) =>
          Effect.gen(function*() {
            const [to] = yield* suppliersNamed(sql, [name])
            if (to === undefined) return yield* fail(`Er is geen leverancier “${name}”.`)
            if (to.paused) return yield* fail(`${to.name} staat op pauze; de bestelling is niet verplaatst.`)
            const legs = yield* sql<{ id: string; supplierId: string | null; state: string }>`
              select id, supplier_id, state from forwarding_items where order_id = ${orderId} and state <> 'cancelled'`
            return { to, legs }
          })
        )
        if (plan.legs.some((l) => l.supplierId === plan.to.id)) {
          return {
            status: "skipped" as const,
            output: { supplierId: plan.to.id },
            explanation: `Al bij ${plan.to.name}.`
          }
        }
        const open = plan.legs.filter((l) => l.state === "to_forward" || l.state === "error")
        if (open.length === 0) {
          return yield* fail("De bestelling is al doorgestuurd; een flow verplaatst geen verzonden bestelling.")
        }
        const forwarding = yield* ForwardingService
        for (const leg of open) {
          yield* asAccount(forwarding.reroute({ id: leg.id, toSupplierId: plan.to.id })).pipe(
            Effect.catchTag("Conflict", () => fail("Die leverancier heeft al een deel van deze bestelling."))
          )
        }
        return {
          status: "succeeded" as const,
          output: { supplierId: plan.to.id, legIds: open.map((l) => l.id) },
          explanation: `Doorsturen gaat nu naar ${plan.to.name}.`
        }
      }

      /* Track & trace bijwerken: the order's parcels read again from the carrier, where AfterShip tracks them. */
      case "action.update_tracking": {
        if (p.role.levels.orders < 2) return yield* forbidden()
        const orderId = yield* orderOf(input)
        const tracking = yield* Effect.serviceOption(Tracking)
        const parcels = yield* scoped((sql) =>
          sql<{ id: string; trackingNumber: string; aftershipId: string | null; status: string }>`
            select id, tracking_number, aftership_id, status from deliveries where order_id = ${orderId}`
        )
        if (parcels.length === 0) {
          return {
            status: "skipped" as const,
            output: {},
            explanation: "Deze bestelling heeft nog geen trackingnummer."
          }
        }
        const read: Array<{ number: string; status: string }> = []
        for (const parcel of parcels) {
          if (parcel.aftershipId === null || Option.isNone(tracking) || !tracking.value.configured) {
            read.push({ number: parcel.trackingNumber, status: parcel.status })
            continue
          }
          const snapshot = yield* tracking.value.get(parcel.aftershipId).pipe(
            Effect.catch(() => fail("De vervoerder gaf geen antwoord; Insyte probeert het opnieuw.", false))
          )
          yield* scoped((sql) => ingest(sql, parcel.id, snapshot))
          read.push({ number: parcel.trackingNumber, status: snapshot.status })
        }
        const fresh = parcels.some((x) => x.aftershipId !== null) && Option.isSome(tracking) &&
          tracking.value.configured
        return {
          status: "succeeded" as const,
          output: { parcels: read },
          explanation: fresh
            ? `Track & trace bijgewerkt: ${read.map((r) => `${r.number} (${r.status})`).join(", ")}.`
            : "Track & trace komt nu van Shopify; er is niets nieuws op te halen."
        }
      }

      /* Leverdatum herberekenen: when the order should be at the door, and on whose word. */
      case "action.check_eta": {
        if (p.role.levels.orders < 1) return yield* forbidden()
        const orderId = yield* orderOf(input)
        const eta = yield* scoped((sql) => etaOf(sql, orderId))
        if (eta === undefined) {
          return {
            status: "skipped" as const,
            output: {},
            explanation: "Deze bestelling is geannuleerd; er komt geen levering."
          }
        }
        const day = eta.at.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" })
        return {
          status: "succeeded" as const,
          output: { expectedAt: eta.at.toISOString(), basis: eta.basis },
          explanation: eta.basis === "delivered" ? `Bezorgd op ${day}.` : `Verwacht op ${day}, ${ETA_BASIS[eta.basis]}.`
        }
      }

      /* The AI steps: a reply draft (never sent), a summary, the ticket's topic. Within the month's AI budget. */
      case "action.ai_compose":
      case "action.ai_summarize":
      case "action.ai_classify": {
        if (p.role.levels.support < 1) return yield* forbidden()
        const subject = yield* scoped((sql) => aiSubjectOf(sql, input))
        if (subject === undefined) {
          return {
            status: "skipped" as const,
            output: {},
            explanation: "Er is geen gesprek of ticket bij deze run om met AI aan te werken."
          }
        }
        if (input.node.variantId === "action.ai_compose") {
          const draft = yield* asAccount(withAi((ai) => Effect.flatMap(ai.drafts, (d) => d.reply({ subject })))).pipe(
            Effect.catch(aiRefused)
          )
          return {
            status: "succeeded" as const,
            output: { draftId: draft.id, subject },
            explanation: "Antwoord opgesteld; het staat klaar in het gesprek en gaat pas weg als iemand het verstuurt."
          }
        }
        if (input.node.variantId === "action.ai_summarize") {
          const summary = yield* asAccount(withAi((ai) =>
            Effect.flatMap(ai.drafts, (d) =>
              subject.type === "ticket"
                ? Effect.map(d.summarizeTicket(subject.id), (s) => ({ id: s.commentId, text: s.text }))
                : Effect.map(d.summarizeThread(subject.id), (s) => ({ id: s.draftId, text: s.text })))
          )).pipe(Effect.catch(aiRefused))
          return {
            status: "succeeded" as const,
            output: { summaryId: summary.id, subject },
            explanation: subject.type === "ticket"
              ? "Samenvatting op het ticket gezet."
              : "Samenvatting bij het gesprek gezet."
          }
        }
        if (subject.type !== "ticket") {
          return {
            status: "skipped" as const,
            output: {},
            explanation: "Het onderwerp lezen gaat over een ticket; deze run heeft er geen."
          }
        }
        const outcome = yield* asAccount(withAi((ai) => ai.classifyTicket(subject.id))).pipe(Effect.catch(aiRefused))
        const [t] = yield* scoped((sql) =>
          sql<{ topic: string | null }>`select topic from tickets where id = ${subject.id}`
        )
        return {
          status: "succeeded" as const,
          output: { ticketId: subject.id, topic: t?.topic ?? null, outcome },
          explanation: t?.topic == null ? "Het onderwerp is gelezen." : `Onderwerp: ${t.topic}.`
        }
      }
      default:
        return { status: "skipped" as const, output: {} }
    }
  }).pipe(Effect.provide(ForwardingService.layer))

  return run.pipe(
    Effect.catch((error) =>
      error instanceof StepFailed ? Effect.fail(error) : Effect.fail(explain(input.node.variantId, error))
    )
  )
}
