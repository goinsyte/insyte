import { Db } from "@insyte/database/Db"
import { fill, handlingOf, missingIn } from "@insyte/domain/automations/Engine"
import { type FlowNode, type LaneNode, scopesRequired, validate } from "@insyte/domain/automations/Graph"
import { accountScopes, SCOPE_LABEL } from "@insyte/domain/automations/Scopes"
import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { TestResult, TestStep } from "../domain/Runs.ts"
import { ETA_BASIS, etaOf, orderContext } from "./context.ts"
import { decide, membersNamed, notYet } from "./engine.ts"
import { connectedBrands, rowOf1, settingsOf } from "./read.ts"

/*
 * "Test met voorbeeld" (M12 step 4; api.md §2.14): the draft walked against a real order, as a run would, with nothing
 * kept or sent. Conditions and splitsingen are decided on the order; waits and approvals are passed over; each action
 * says what it would do, or why it could not: a field the order lacks, a right the flow would not hold, a teammate who
 * is not there, a service not connected. Nothing is written, so there is nothing to roll back. It shows a real order
 * and its customer, so it takes Bestellingen · Bekijken and Klanten · Bekijken beside Automatiseringen · Bewerken.
 */

type Step = FlowNode | LaneNode

const label = (n: Step) => STEPS_BY_ID[n.variantId]?.label ?? n.variantId

export const test = Effect.fn("Automations.test")(
  function*(input: { readonly id: string; readonly recordRef?: string | undefined }) {
    yield* Policy.require("automations", 2)
    yield* Policy.require("orders", 1)
    yield* Policy.require("customers", 1)
    const db = yield* Db
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const { row } = yield* rowOf1(sql, input.id)
        const nodes = row.nodes
        const settings = yield* settingsOf(sql, input.id)
        const connected = yield* connectedBrands(sql)
        const sample = yield* sampleOf(sql, input.id, input.recordRef)
        const context = sample === undefined ? {} : ((yield* orderContext(sql, sample.id)) ?? {})
        const held = new Set(accountScopes(scopesRequired(nodes), settings))
        const errors = new Map<string, string>()
        for (
          const i of validate(nodes, { scopesOff: settings.scopesOff, connected: new Set(connected), selfId: input.id })
        ) {
          if (i.severity === "error" && i.nodeId !== null && !errors.has(i.nodeId)) errors.set(i.nodeId, i.message)
        }
        const ref = sample === undefined
          ? null
          : { kind: "order" as const, id: sample.id, number: sample.number, name: sample.name }
        if (nodes.length === 0 || handlingOf(nodes[0]!.variantId) !== "trigger") {
          return new TestResult({
            ok: false,
            sample: ref,
            steps: [],
            stoppedAt: nodes[0]?.id ?? null,
            reason: "Zet eerst een trigger bovenaan; een test loopt de flow vanaf de trigger door."
          })
        }
        if (sample === undefined) {
          return new TestResult({
            ok: false,
            sample: null,
            steps: [],
            stoppedAt: nodes[0]!.id,
            reason: "Er is nog geen bestelling om mee te testen. Koppel een winkel of wacht op de eerste bestelling."
          })
        }

        const steps: Array<TestStep> = []
        const fullContext = { "trigger.summary": `Bestelling ${sample.number}`, ...context }
        const said = (n: Step, lane: "yes" | "no" | null, status: TestStep["status"], explanation: string | null) =>
          steps.push(new TestStep({ nodeId: n.id, variantId: n.variantId, lane, status, explanation }))

        /** One step; a reason when it stops the test. */
        const one = (n: Step, lane: "yes" | "no" | null): Effect.Effect<string | undefined, never, never> =>
          Effect.gen(function*() {
            const wrong = errors.get(n.id)
            if (wrong !== undefined) {
              said(n, lane, "error", wrong)
              return wrong
            }
            switch (handlingOf(n.variantId)) {
              case "trigger":
                said(n, lane, "ok", `Voorbeeld: bestelling ${sample.number}.`)
                return undefined
              case "condition": {
                if (decide(n.variantId, n.config, fullContext)) {
                  said(n, lane, "ok", "Dit voorbeeld voldoet aan de voorwaarde.")
                  return undefined
                }
                const why = "Dit voorbeeld voldoet niet aan de voorwaarde; een echte run stopt hier."
                said(n, lane, "stopped", why)
                return why
              }
              case "branch":
                return undefined
              case "wait":
                said(n, lane, "ok", `Wacht ${String(n.config["minutes"] ?? 30)} minuten; in een test niet.`)
                return undefined
              case "wait_no_reply":
                said(n, lane, "ok", `Wacht ${String(n.config["hours"] ?? 24)} uur op de klant; in een test niet.`)
                return undefined
              case "approval":
                said(
                  n,
                  lane,
                  "ok",
                  `Vraagt ${
                    String(n.config["approver_name"] ?? "") || "een collega"
                  } om goedkeuring; de test gaat uit van ja.`
                )
                return undefined
              case "unsupported": {
                said(n, lane, "skipped", notYet(n.variantId, connected))
                return undefined
              }
              case "action": {
                const scope = STEPS_BY_ID[n.variantId]?.scope
                if (scope !== undefined && !held.has(scope)) {
                  const why = `De flow mist het recht “${SCOPE_LABEL[scope] ?? scope}”. Zet het aan bij Instellingen.`
                  said(n, lane, "error", why)
                  return why
                }
                const missing = missingIn(n.config, fullContext)
                if (missing.length > 0) {
                  const why = `Dit voorbeeld heeft geen ${missing.map((m) => `{{${m}}}`).join(", ")}.`
                  said(n, lane, "error", why)
                  return why
                }
                const text = (key: string) => fill(String(n.config[key] ?? ""), fullContext).trim()
                const would = yield* wouldDo(sql, n, text, sample)
                said(n, lane, would.status, would.explanation)
                return undefined
              }
            }
          }).pipe(Effect.orDie)

        let stop: { nodeId: string; reason: string } | undefined
        for (const n of nodes) {
          const why = yield* one(n, null)
          if (why !== undefined) {
            stop = { nodeId: n.id, reason: why }
            break
          }
          if (n.branches === undefined) continue
          const yes = decide(n.variantId, n.config, fullContext)
          steps.push(
            new TestStep({
              nodeId: n.id,
              variantId: n.variantId,
              lane: null,
              status: "ok",
              explanation: yes ? "Dit voorbeeld gaat de Ja-kant op." : "Dit voorbeeld gaat de Nee-kant op."
            })
          )
          const taken = yes ? n.branches.yes : n.branches.no
          for (const m of yes ? n.branches.no : n.branches.yes) said(m, yes ? "no" : "yes", "skipped", null)
          for (const m of taken) {
            const inLane = yield* one(m, yes ? "yes" : "no")
            if (inLane !== undefined) {
              stop = { nodeId: m.id, reason: inLane }
              break
            }
          }
          if (stop !== undefined) break
        }
        return new TestResult({
          ok: stop === undefined,
          sample: ref,
          steps,
          stoppedAt: stop?.nodeId ?? null,
          reason: stop === undefined ? null : `${label(nodeOf(nodes, stop.nodeId))}: ${stop.reason}`
        })
      })
    )
  }
)

const nodeOf = (nodes: ReadonlyArray<FlowNode>, id: string): Step =>
  nodes.flatMap((n) => (n.branches === undefined ? [n] : [n, ...n.branches.yes, ...n.branches.no])).find((n) =>
    n.id === id
  ) ?? { id, variantId: id, config: {} }

/** The order to walk: the one named, or the newest in the flow's stores and the person's. */
const sampleOf = Effect.fn("Automations.sampleOf")(function*(
  sql: SqlClient.SqlClient,
  automationId: string,
  recordRef: string | undefined
) {
  const scope = yield* inScope(sql, "o.store_id")
  const [flow] = yield* sql<{ storeScope: Array<string> | null }>`
    select store_scope from automations where id = ${automationId}`
  const stores = flow?.storeScope == null ? sql`true` : sql`o.store_id = any(${flow.storeScope})`
  const named = recordRef === undefined ? sql`true` : sql`(o.id = ${recordRef} or o.number = ${recordRef})`
  const [o] = yield* sql<{ id: string; number: string; name: string | null; customerId: string | null }>`
    select o.id, o.number, o.customer_name as name, o.customer_id from orders o
    where ${scope} and ${stores} and ${named} and not o.is_draft
    order by o.placed_at desc nulls last, o.id desc limit 1`
  if (o === undefined && recordRef !== undefined) return yield* new NotFound({ entity: "order", id: recordRef })
  return o === undefined ? undefined : { id: o.id, number: o.number, name: o.name ?? "", customerId: o.customerId }
})

/** What an action would do on this order, said; checked where the run would refuse it. */
const wouldDo = Effect.fn("Automations.wouldDo")(function*(
  sql: SqlClient.SqlClient,
  n: Step,
  text: (key: string) => string,
  sample: { readonly id: string; readonly customerId: string | null }
) {
  switch (n.variantId) {
    case "action.create_ticket": {
      const assignee = text("assignee")
      const found = assignee === "" ? [] : yield* membersNamed(sql, assignee)
      return {
        status: "ok" as const,
        explanation: assignee !== "" && found.length === 0
          ? `Zou het ticket “${text("title")}” maken; niemand heet “${assignee}”, dus het wordt niet toegewezen.`
          : `Zou het ticket “${text("title")}” maken.`
      }
    }
    case "action.tag_customer":
      return sample.customerId === null
        ? { status: "skipped" as const, explanation: "Deze bestelling heeft geen klant om te labelen." }
        : { status: "ok" as const, explanation: `Zou de klant het label “${text("tag")}” geven.` }
    case "action.alert_team": {
      const who = text("team")
      const found = yield* membersNamed(sql, who)
      return {
        status: "ok" as const,
        explanation: found.length > 0
          ? `Zou ${who} waarschuwen.`
          : `Niemand heet “${who}”; de eigenaar van de flow zou de melding krijgen.`
      }
    }
    case "action.track_event":
      return { status: "ok" as const, explanation: `Zou “${text("event") || "automation.fired"}” vastleggen.` }
    case "action.notify_supplier": {
      const names = text("supplier").split(/\s*,\s*/).filter((n) => n !== "")
      if (names.length === 0) {
        return {
          status: "skipped" as const,
          explanation: "Deze bestelling heeft nog geen leverancier om te berichten."
        }
      }
      const found = yield* sql<{ name: string; channel: boolean }>`
        select s.name, exists (select 1 from conversations c where c.supplier_id = s.id and c.kind = 'supplier_channel'
                                 and c.archived_at is null) as channel
        from suppliers s where s.deleted_at is null and lower(s.name) in ${sql.in(names.map((n) => n.toLowerCase()))}`
      const missing = names.filter((n) => !found.some((s) => s.name.toLowerCase() === n.toLowerCase()))
      if (missing.length > 0) {
        return { status: "error" as const, explanation: `Er is geen leverancier “${missing.join("”, “")}”.` }
      }
      const closed = found.filter((s) => !s.channel)
      return closed.length > 0
        ? { status: "error" as const, explanation: `${closed.map((s) => s.name).join(", ")} heeft nog geen kanaal.` }
        : { status: "ok" as const, explanation: `Zou ${found.map((s) => s.name).join(", ")} een bericht sturen.` }
    }
    case "action.refund": {
      const amount = text("amount")
      return {
        status: "ok" as const,
        explanation: `Zou ${
          amount === "" || amount.toLowerCase() === "volledig" ? "het openstaande bedrag" : `€ ${amount}`
        } terugbetalen, binnen de limiet van de flow.`
      }
    }
    case "action.assign_supplier":
      return {
        status: "ok" as const,
        explanation: `Zou het doorsturen van deze bestelling naar ${text("supplier")} zetten.`
      }
    case "action.update_tracking":
      return { status: "ok" as const, explanation: "Zou track & trace opnieuw ophalen bij de vervoerder." }
    case "action.check_eta": {
      const eta = yield* etaOf(sql, sample.id)
      if (eta === undefined) return { status: "skipped" as const, explanation: "Deze bestelling is geannuleerd." }
      const day = eta.at.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" })
      return {
        status: "ok" as const,
        explanation: eta.basis === "delivered" ? `Bezorgd op ${day}.` : `Verwacht op ${day}, ${ETA_BASIS[eta.basis]}.`
      }
    }
    case "action.ai_compose":
      return {
        status: "ok" as const,
        explanation: "Zou met Insyte AI een antwoord opstellen; versturen doet iemand zelf."
      }
    case "action.ai_summarize":
      return { status: "ok" as const, explanation: "Zou met Insyte AI een samenvatting maken." }
    case "action.ai_classify":
      return { status: "ok" as const, explanation: "Zou met Insyte AI het onderwerp van het ticket bepalen." }
    default:
      return { status: "skipped" as const, explanation: notYet(n.variantId, []) }
  }
})
