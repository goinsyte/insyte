import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import type { ActInput, Did } from "@insyte/modules/automations/Links"
import { ETA_BASIS, etaOf } from "@insyte/modules/automations/use-cases/context"
import { explain, StepFailed } from "@insyte/modules/automations/use-cases/engine"
import { conversationOf } from "@insyte/modules/chats/use-cases/chats"
import { post } from "@insyte/modules/chats/use-cases/commands"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { refundOn } from "@insyte/modules/orders/use-cases/refund"
import { PendingEvents } from "@insyte/modules/shared/domain/Outbox"
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
 * A flow refunds at most this much per order (in cents), and never more than the flow's owner may refund themselves:
 * money goes out without anyone looking, so the safest default holds it to a small amount (Beslissen in the PR).
 */
export const FLOW_REFUND_CAP_MINOR = 10_000

const euro = (minor: number) =>
  `€ ${(minor / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fail = (explanation: string, terminal = true) => Effect.fail(new StepFailed({ explanation, terminal }))

/** The run's order, or the step cannot do anything: a mail or a stock run has none. */
const orderOf = (input: ActInput) =>
  input.plan.orderId === null
    ? fail("Deze run gaat niet over een bestelling, dus deze stap kan niets doen.")
    : Effect.succeed(input.plan.orderId)

/** "volledig" (or nothing) is what is left on the order; "25,00" and "€ 25" are euros. */
const amountOf = (text: string): "full" | number | undefined => {
  const t = text.trim().toLowerCase()
  if (t === "" || t === "volledig" || t === "alles" || t === "full") return "full"
  const cleaned = t.replace(/[€\s]/g, "")
  const normal = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "")
  const n = Number(normal)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined
}

/**
 * What the flow may refund per order: its owner's own limit (a role without Terugbetalen gives none), and never more
 * than `FLOW_REFUND_CAP_MINOR`. A flow without an active owner refunds nothing.
 */
const flowLimitOf = (sql: SqlClient.SqlClient, automationId: string) =>
  Effect.map(
    sql<{ roleId: string; limitMinor: string | null; may: boolean }>`
      select r.id as role_id, r.refund_limit_minor as limit_minor,
             coalesce((r.specials ->> 'refunds.write')::boolean, false) as may
      from automations a
      join members m on m.id = a.owner_member_id and m.deactivated_at is null and m.removed_at is null
      join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where a.id = ${automationId}`,
    ([owner]) => {
      if (owner === undefined) return 0
      if (owner.roleId === "owner") return FLOW_REFUND_CAP_MINOR
      if (!owner.may) return 0
      return owner.limitMinor === null
        ? FLOW_REFUND_CAP_MINOR
        : Math.min(FLOW_REFUND_CAP_MINOR, Number(owner.limitMinor))
    }
  )

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

      /* Terugbetalen: within the flow's limit and what is left on the order, audited as the flow's account. */
      case "action.refund": {
        if (p.role.levels.orders < 2 || !p.role.specials["refunds.write"]) return yield* forbidden()
        const orderId = yield* orderOf(input)
        const asked = amountOf(input.text("amount"))
        if (asked === undefined) {
          return yield* fail(`“${input.text("amount")}” is geen bedrag; schrijf “volledig” of “25,00”.`)
        }
        return yield* scoped((sql) =>
          Effect.gen(function*() {
            const limitMinor = yield* flowLimitOf(sql, input.plan.automationId)
            if (limitMinor === 0) {
              return yield* fail(
                "De eigenaar van de flow mag zelf niet terugbetalen, dus de flow ook niet. Geef de flow een eigenaar met het recht Terugbetalen."
              )
            }
            const [o] = yield* sql<{ balanceMinor: string }>`
              select o.total_minor - coalesce((select sum(r.amount_minor) from refunds r
                                               where r.order_id = o.id and r.status <> 'failed'), 0) as balance_minor
              from orders o where o.id = ${orderId}`
            const balance = Number(o?.balanceMinor ?? 0)
            const amountMinor = asked === "full" ? balance : asked
            if (amountMinor <= 0) return yield* fail("De bestelling is al volledig terugbetaald.")
            if (amountMinor > limitMinor) {
              return yield* fail(
                `${euro(amountMinor)} is meer dan de flow per bestelling mag terugbetalen (${
                  euro(limitMinor)
                }). Doe het zelf, of vraag eerst goedkeuring.`
              )
            }
            const account = { ...p, role: { ...p.role, refundLimit: limitMinor / 100 } }
            const reason = input.text("reason")
            const done = yield* refundOn(sql, {
              id: orderId,
              refundId: mintId("rfd") as never,
              amountMinor,
              note: `${reason === "" ? "Terugbetaald" : reason} · automatisering “${input.plan.name}”`
            }).pipe(Effect.provideService(CurrentPrincipal, account))
            if (done.outboxId !== null) (yield* PendingEvents)?.add(done.outboxId)
            return {
              status: "succeeded" as const,
              output: { refundId: done.result.refundId, amountMinor },
              explanation: `${euro(amountMinor)} terugbetaald; Shopify verwerkt het.`
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
