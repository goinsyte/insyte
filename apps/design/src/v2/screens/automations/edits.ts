import { flatSteps, SCOPES, stepType } from "../../fixtures/automations.ts"
import type { Automation, Step } from "../../fixtures/automations.ts"
import { customer, ORDERS } from "../../fixtures/records.ts"
import type { Order } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"

/*
 * The flow's edits as pure functions over its steps: where a step goes (the main line, or one lane of a
 * Ja/nee-splitsing), adding, moving and taking one out; what is wrong with a step before it runs; the
 * path a test walks; and a sentence read as steps. Rebuilt from `/app/automations` (`flow-edits.ts`,
 * `workflow-store.ts`) on this version's steps.
 */

export type Lane = { readonly branchId: string; readonly side: "yes" | "no" }
export type Place = { readonly lane?: Lane; readonly index: number }

export const isTrigger = (st: Step | undefined) => st !== undefined && stepType(st.type)?.kind === "trigger"

let made = 0
export function newStep(type: string, summary?: string, values?: Readonly<Record<string, string>>): Step {
  made += 1
  const t = stepType(type)
  return {
    id: `s${Date.now().toString(36)}${made}`,
    type,
    summary: summary ?? t?.label ?? "Stap",
    ...(values === undefined ? {} : { values }),
    ...(type === "branch" ? { branches: { yes: [], no: [] } } : {})
  }
}

function withList(
  steps: ReadonlyArray<Step>,
  lane: Lane | undefined,
  f: (list: ReadonlyArray<Step>) => ReadonlyArray<Step>
): ReadonlyArray<Step> {
  if (lane === undefined) return f(steps)
  return steps.map((st) =>
    st.id === lane.branchId && st.branches !== undefined
      ? { ...st, branches: { ...st.branches, [lane.side]: f(st.branches[lane.side]) } }
      : st
  )
}

/** The steps without one, and the one taken out. */
function without(steps: ReadonlyArray<Step>, id: string): readonly [ReadonlyArray<Step>, Step | null] {
  let found: Step | null = null
  const out = steps.filter((st) => {
    if (st.id !== id) return true
    found = st
    return false
  }).map((st) => {
    if (st.branches === undefined || found !== null) return st
    const [yes, a] = without(st.branches.yes, id)
    const [no, b] = without(st.branches.no, id)
    found = a ?? b
    return found === null ? st : { ...st, branches: { yes, no } }
  })
  return [out, found]
}

/** Where a step stands now. */
export function placeOf(steps: ReadonlyArray<Step>, id: string): Place | null {
  const i = steps.findIndex((st) => st.id === id)
  if (i >= 0) return { index: i }
  for (const st of steps) {
    if (st.branches === undefined) continue
    for (const side of ["yes", "no"] as const) {
      const j = st.branches[side].findIndex((x) => x.id === id)
      if (j >= 0) return { lane: { branchId: st.id, side }, index: j }
    }
  }
  return null
}

/** The list a place is in: the main line or a lane. */
export function listAt(steps: ReadonlyArray<Step>, lane: Lane | undefined): ReadonlyArray<Step> {
  if (lane === undefined) return steps
  return steps.find((st) => st.id === lane.branchId)?.branches?.[lane.side] ?? []
}

function insertInto(steps: ReadonlyArray<Step>, st: Step, place: Place): ReadonlyArray<Step> {
  return withList(steps, place.lane, (list) => {
    const min = place.lane === undefined && isTrigger(list[0]) ? 1 : 0
    const at = Math.max(min, Math.min(place.index, list.length))
    return [...list.slice(0, at), st, ...list.slice(at)]
  })
}

/** A step added at a place; a trigger takes the head (and replaces the one there). `null` where it cannot go. */
export function insertStep(steps: ReadonlyArray<Step>, st: Step, place: Place): ReadonlyArray<Step> | null {
  if (isTrigger(st)) return isTrigger(steps[0]) ? [st, ...steps.slice(1)] : [st, ...steps]
  if (st.branches !== undefined && place.lane !== undefined) return null
  return insertInto(steps, st, place)
}

/** A step moved to another place, in its own lane or another; `null` where it cannot go there. */
export function moveStep(steps: ReadonlyArray<Step>, id: string, place: Place): ReadonlyArray<Step> | null {
  const from = placeOf(steps, id)
  const [rest, moving] = without(steps, id)
  if (moving === null || from === null || isTrigger(moving)) return null
  if (moving.branches !== undefined && place.lane !== undefined) return null
  if (place.lane?.branchId === id) return null
  const same = (from.lane?.branchId ?? "") === (place.lane?.branchId ?? "") && from.lane?.side === place.lane?.side
  const index = same && from.index < place.index ? place.index - 1 : place.index
  return insertInto(rest, moving, { ...place, index })
}

export function removeStep(steps: ReadonlyArray<Step>, id: string): ReadonlyArray<Step> {
  return without(steps, id)[0]
}

/** One step changed, wherever it stands. */
export function updateStep(steps: ReadonlyArray<Step>, id: string, f: (st: Step) => Step): ReadonlyArray<Step> {
  return steps.map((st) =>
    st.id === id
      ? f(st)
      : st.branches === undefined
      ? st
      : { ...st, branches: { yes: updateStep(st.branches.yes, id, f), no: updateStep(st.branches.no, id, f) } }
  )
}

export const findStep = (steps: ReadonlyArray<Step>, id: string | null) =>
  id === null ? undefined : flatSteps(steps).find((st) => st.id === id)

/* ── what stops a step ───────────────────────────────────────────────────────────────────────── */

/** What is wrong with one step before it runs: an empty field it needs, a right switched off, an empty splitsing. */
export function stepIssues(st: Step, flow: Pick<Automation, "scopesOff">): ReadonlyArray<string> {
  const t = stepType(st.type)
  if (t === undefined) return ["Insyte kent deze stap niet meer. Haal hem weg of kies een andere."]
  const out: Array<string> = []
  for (const field of t.fields) {
    if (field.required === true && (st.values?.[field.key] ?? "").trim() === "") out.push(`${field.label} is leeg.`)
  }
  if (t.scope !== undefined && flow.scopesOff?.includes(t.scope) === true) {
    const label = SCOPES.find((x) => x.id === t.scope)?.label ?? t.scope
    out.push(`De flow mag ‘${label}’ niet. Zet het aan onder Instellingen › Rechten.`)
  }
  if (st.branches !== undefined && st.branches.yes.length + st.branches.no.length === 0) {
    out.push("Beide wegen van de splitsing zijn leeg.")
  }
  return out
}

/** Every step's problems, by step id; only the steps that have one. */
export function issuesOf(flow: Pick<Automation, "steps" | "scopesOff">): ReadonlyMap<string, ReadonlyArray<string>> {
  const out = new Map<string, ReadonlyArray<string>>()
  for (const st of flatSteps(flow.steps)) {
    const found = stepIssues(st, flow)
    if (found.length > 0) out.set(st.id, found)
  }
  return out
}

/* ── the test: one real order, walked step by step ───────────────────────────────────────────── */

/** The order a test runs on: the one the flow last touched, or the latest late one. */
export function sampleOf(flow: Pick<Automation, "touches">): Order | undefined {
  const href = flow.touches.find((t) => t.kind === "order")?.href
  const number = href?.split("/").at(-1)
  return ORDERS.find((o) => o.number === number) ?? ORDERS.find((o) => o.status === "vertraagd") ?? ORDERS[0]
}

export const sampleLabel = (o: Order | undefined) =>
  o === undefined ? "een voorbeeld" : `#${o.number} · ${customer(o.customerId)?.name ?? "klant"}`

/** The steps a run on this order goes through: a splitsing sends it down one lane. */
export function pathOf(
  steps: ReadonlyArray<Step>,
  big: boolean
): ReadonlyArray<Step & { readonly lane?: "yes" | "no" }> {
  return steps.flatMap((st) => {
    if (st.branches === undefined) return [st]
    const side = big ? "yes" : "no"
    return [st, ...st.branches[side].map((x) => ({ ...x, lane: side }))]
  })
}

/* ── a sentence read as steps ────────────────────────────────────────────────────────────────── */

/** What the prompt bar offers before anything is typed. */
export const PROMPTS: ReadonlyArray<string> = [
  "Als een bestelling te laat is, mail de klant en maak een ticket aan voor Maya",
  "Als een chargeback binnenkomt, koppel de bestellingen en maak een ticket",
  "Als de voorraad laag is, laat de leverancier het weten en waarschuw het team",
  "Als een bestelling boven € 150 te laat is, stel excuses op en stuur een Klaviyo-mail"
]

function triggerOf(text: string): string {
  const t = text.toLowerCase()
  if (/verzonden|onderweg/.test(t)) return "order_shipped"
  if (/te laat|vertraag|vertraging|stilstaat/.test(t)) return "shipping_delay"
  if (/chargeback|geschil/.test(t)) return "chargeback"
  if (/terugbetaald|terugbetaling (is )?uitgevoerd/.test(t)) return "refund_done"
  if (/terugbetal|retour|geld terug/.test(t)) return "refund_requested"
  if (/review|sterren/.test(t)) return "review"
  if (/voorraad|uitverkocht/.test(t)) return "stock_low"
  if (/elke (dag|week|maandag|maand)|dagelijks|wekelijks/.test(t)) return "schedule"
  if (/trefwoord|mail met|e-mail met/.test(t)) return "email_keyword"
  if (/antwoordt|reageert|klaagt|boos/.test(t)) return "customer_reply"
  return "order_placed"
}

function actionOf(clause: string): string {
  const t = clause.toLowerCase()
  if (t.includes("klaviyo")) return "klaviyo_send"
  if (/excus|persoonlijk|opstellen|stel .* op/.test(t)) return "ai_compose"
  if (/samenvat/.test(t)) return "ai_summarize"
  if (/koppel/.test(t)) return "ai_link_orders"
  if (/sentiment|toon van/.test(t)) return "ai_classify"
  if (/bewijs/.test(t)) return "dispute_evidence"
  if (/leverancier/.test(t)) return "notify_supplier"
  if (/goedkeur|toestemming/.test(t)) return "require_approval"
  if (/terugbetal|geld terug/.test(t)) return "stripe_refund"
  if (/label|tag/.test(t)) return "tag_customer"
  if (/ticket|zaak/.test(t)) return "create_ticket"
  if (/wacht/.test(t)) return "wait"
  if (/waarschuw|laat .*weten|meld|slack|team|collega/.test(t)) return "alert_team"
  if (/mail|bericht|stuur/.test(t)) return "send_email"
  return "create_ticket"
}

const COUNTRIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bduits(land|e)?\b/i, "Duitsland"],
  [/\bfrankrijk\b|\bfranse?\b/i, "Frankrijk"],
  [/\bnederland(se)?\b/i, "Nederland"],
  [/\bbelgi(ë|e)\b|\bbelgische?\b/i, "België"]
]

const upper = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

/** The fields a drafted step gets, so it can run as it stands; the clause becomes its own words. */
function valuesFor(type: string, clause: string): Readonly<Record<string, string>> | undefined {
  const who = Object.values(PEOPLE).find((p) => new RegExp(`\\b${p.name.split(" ")[0] ?? ""}\\b`, "i").test(clause))
  switch (type) {
    case "send_email":
      return { to: "{{klant.e-mail}}", subject: upper(clause) }
    case "klaviyo_send":
      return { template: /excus/i.test(clause) ? "Excuses met korting" : "Vertraging" }
    case "create_ticket":
      return { title: "{{bestelling.nummer}}: opvolgen", queue: "Nieuw", ...(who ? { assignee: who.name } : {}) }
    case "alert_team":
      return { who: who?.name ?? "Elena Hart" }
    case "notify_supplier":
      return { supplier: "De leverancier van de bestelling", message: upper(clause) }
    case "tag_customer":
      return { tag: /vip/i.test(clause) ? "vip" : "opvolgen" }
    case "require_approval":
      return { approver: who?.name ?? "Elena Hart" }
    case "wait":
      return { time: /(\d+\s*(uur|dagen|dag|u))/i.exec(clause)?.[1] ?? "24 uur" }
    case "ai_compose":
      return { tone: "Warm", instructions: "Kort, met de voornaam" }
    default:
      return undefined
  }
}

/**
 * A plain sentence read as a flow: what starts it, a check on the country if one is named, then up to
 * three actions, one per clause. "Boven € 100" splits the flow on the order's value. Scripted from the
 * words, so the same sentence always lays out the same steps.
 */
export function draftFromPrompt(prompt: string): ReadonlyArray<Step> {
  const text = prompt.trim()
  const [head = "", ...rest] = text.split(/,|\bdan\b/i)
  const trigger = newStep(triggerOf(text), upper(head.replace(/^\s*(als|wanneer|zodra)\s+/i, "").trim()))
  const steps: Array<Step> = [trigger]
  const country = COUNTRIES.find(([re]) => re.test(text))?.[1]
  if (country !== undefined) steps.push(newStep("country", `Alleen klanten in ${country}`, { country }))

  const clauses = rest.join(",").split(/,|\ben\b/i).map((c) => c.trim().replace(/\.$/, "")).filter((c) => c !== "")
  const seen = new Set<string>()
  const actions: Array<Step> = []
  for (const clause of clauses) {
    const type = actionOf(clause)
    if (seen.has(type)) continue
    seen.add(type)
    actions.push(newStep(type, upper(clause), valuesFor(type, clause)))
    if (actions.length === 3) break
  }
  if (actions.length === 0) actions.push(newStep("create_ticket", "Ticket aanmaken", valuesFor("create_ticket", "")))

  const over = /(boven|meer dan|hoger dan)\s*€?\s*(\d+)/i.exec(text)?.[2]
  if (over !== undefined) {
    const split = newStep("branch", `Bestelling boven € ${over}?`, { rule: `{{bestelling.totaal}} > ${over}` })
    return [...steps, { ...split, branches: { yes: actions, no: [] } }]
  }
  return [...steps, ...actions]
}

/** A name read off the steps: "Levering vertraagd → E-mail sturen + Ticket aanmaken". */
export function nameOf(steps: ReadonlyArray<Step>): string {
  const [first, ...rest] = steps
  if (first === undefined) return "Nieuwe automatisering"
  const actions = flatSteps(rest)
    .map((st) => stepType(st.type))
    .filter((t) => t?.kind === "actie")
    .slice(0, 2)
    .map((t) => t?.label ?? "")
  const head = stepType(first.type)?.label ?? "Flow"
  return actions.length > 0 ? `${head} → ${actions.join(" + ")}` : head
}
