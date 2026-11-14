import type { ActivityRow, AgendaRow, WorkRow } from "@insyte/modules/home/domain/Lists"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import { dayKey, dayStart } from "@insyte/ui/app/lib/home/dates"
import type { Moment, Tone, WorkItem } from "@insyte/ui/app/lib/home/kinds"
import type { EventKey, Note, NoteActor, NoteSource } from "@insyte/ui/app/lib/notifications"
import type { Currency } from "@insyte/ui/app/lib/types/domain"

/*
 * Start's other views in the console (M10.3b): `Home.work`, `Home.agenda` and `Home.activity` hand over facts, and
 * these write them as the design's items, in Dutch, with where each leads. Moving an item to another day and ticking
 * one that has no record of its own (a supplier to chase, an invitation to follow up) are the member's, kept in their
 * `my_work` preference and laid over the rows here.
 */

/** `user_prefs.my_work`: items moved to another day, and items ticked on this list only, by item id. */
export interface MyWorkPref {
  readonly snoozed: Readonly<Record<string, string>>
  readonly done: Readonly<Record<string, number>>
}

export const MY_WORK_DEFAULT: MyWorkPref = { snoozed: {}, done: {} }

/** The entries of a saved map whose values still read. */
const record = <T>(x: unknown, ok: (y: unknown) => y is T): Record<string, T> =>
  typeof x === "object" && x !== null
    ? Object.fromEntries(Object.entries(x).filter((e): e is [string, T] => ok(e[1])))
    : {}

/** What was saved, kept where it still reads. */
export function myWorkOf(value: unknown): MyWorkPref {
  if (typeof value !== "object" || value === null) return MY_WORK_DEFAULT
  const v = value as Record<string, unknown>
  return {
    snoozed: record(v["snoozed"], (y): y is string => typeof y === "string" && /^\d{4}-\d{2}-\d{2}$/.test(y)),
    done: record(v["done"], (y): y is number => typeof y === "number" && Number.isFinite(y))
  }
}

/** A day's tick or snooze is kept for a fortnight; older ones are dropped on the next write. */
export function pruneMyWork(pref: MyWorkPref, now: number): MyWorkPref {
  const since = now - 14 * 86_400_000
  const today = dayKey(now)
  return {
    snoozed: Object.fromEntries(Object.entries(pref.snoozed).filter(([, d]) => d >= today)),
    done: Object.fromEntries(Object.entries(pref.done).filter(([, t]) => t >= since))
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const signalTone = (s: WorkRow["signal"]): Tone => (s === "red" ? "red" : s === "amber" ? "amber" : "ink")

/* ── Mijn werk ─────────────────────────────────────────────────────────────────────────────────── */

/** An item's day and time, where it has them. */
const dated = (day: string | undefined, at: number | undefined) => ({
  ...(day === undefined ? {} : { due: day }),
  ...(at === undefined ? {} : { time: at })
})

/** One row of `Home.work` as Mijn werk lists it, with the member's own snooze and tick laid over it. */
export function workItemOf(r: WorkRow, pref: MyWorkPref, now: number): WorkItem {
  const due = r.dueDay ?? (r.dueAt === null ? undefined : dayKey(r.dueAt))
  const time = r.dueAt ?? undefined
  const base = { id: r.id, ...dated(due, time) }
  const item = ((): WorkItem => {
    switch (r.kind) {
      case "todo":
        return {
          ...base,
          kind: "todo",
          title: r.title,
          where: "Je lijst",
          tone: "arc",
          to: "/dashboard",
          search: { view: "werk" },
          done: r.doneAt !== null,
          ...(r.doneAt === null ? {} : { doneAt: r.doneAt }),
          check: "todo"
        }
      case "queue":
        return {
          ...base,
          kind: "queue",
          title: r.title.split(" · ")[0] ?? r.title,
          where: "Je wachtrij",
          tone: r.signal === "red" ? "red" : "amber",
          to: "/dashboard",
          search: { view: "overzicht", row: r.subjectId },
          done: r.doneAt !== null,
          ...(r.doneAt === null ? {} : { doneAt: r.doneAt }),
          check: "queue",
          queueId: r.subjectId
        }
      case "ticket":
        return {
          id: r.id,
          // A ticket without a deadline is due by its priority, as the design dates it.
          // Its deadline is a day, as the tickets screens read it, not a time on it.
          ...dated(
            due ??
              (r.priority === "high" ? dayKey(now) : r.priority === "medium" ? dayKey(now + 86_400_000) : undefined),
            undefined
          ),
          kind: "ticket",
          title: r.title,
          ...(r.number === null ? {} : { record: `#${r.number}` }),
          where: "Tickets",
          tone: r.priority === "high" ? "red" : r.priority === "medium" ? "amber" : "ink",
          to: `/tickets/${r.subjectId}`,
          done: r.doneAt !== null,
          ...(r.doneAt === null ? {} : { doneAt: r.doneAt }),
          check: "ticket",
          ticketId: r.subjectId
        }
      case "supplier":
        return {
          ...base,
          kind: "supplier",
          title: `${r.title} aansporen over ${plural(r.count ?? 1, "bestelling", "bestellingen")}`,
          ...(r.number === null ? {} : { record: r.number }),
          where: "Leveranciers",
          tone: r.dueAt !== null && r.dueAt < now ? "red" : "amber",
          to: "/suppliers",
          done: pref.done[r.id] !== undefined,
          ...(pref.done[r.id] === undefined ? {} : { doneAt: pref.done[r.id] }),
          check: "local"
        }
      case "invite": {
        const lapsed = r.signal === "red"
        return {
          // An invitation is followed up on a day, not at the minute it was read.
          id: r.id,
          ...dated(due, undefined),
          kind: "invite",
          title: lapsed ? `Uitnodiging opnieuw versturen aan ${r.title}` : `Uitnodiging opvolgen: ${r.title}`,
          where: "Team",
          tone: lapsed ? "red" : signalTone(r.signal),
          to: "/settings/team",
          done: pref.done[r.id] !== undefined,
          ...(pref.done[r.id] === undefined ? {} : { doneAt: pref.done[r.id] }),
          check: "local"
        }
      }
    }
  })()
  // Moved to another day: the snooze wins over the record's own date.
  const moved = pref.snoozed[r.id]
  if (moved === undefined || item.done) return item
  const { time: _, ...rest } = item
  return { ...rest, due: moved }
}

/* ── Agenda ────────────────────────────────────────────────────────────────────────────────────── */

/** One row of `Home.agenda` as a moment on the clock. */
export function momentOf(r: AgendaRow): Moment {
  const tone: Tone = r.signal === "red" ? "red" : r.signal === "amber" ? "amber" : "ink"
  switch (r.kind) {
    case "queue":
      return {
        id: r.id,
        kind: "queue",
        at: r.at,
        minutes: 30,
        title: r.title.split(" · ")[0] ?? r.title,
        ...(r.detail === null ? {} : { detail: r.detail }),
        tone,
        to: "/dashboard",
        search: { view: "overzicht", row: r.subjectId },
        queueId: r.subjectId
      }
    case "supplier": {
      const n = r.count ?? 0
      const late = r.late ?? 0
      return {
        id: r.id,
        kind: "supplier",
        at: r.at,
        minutes: 45,
        title: `Overdracht ${r.title}`,
        detail: [
          late > 0
            ? `${plural(late, "bestelling loopt", "bestellingen lopen")} uit`
            : plural(n, "bestelling", "bestellingen"),
          r.detail
        ].filter((t) => t !== null && t !== "").join(" · "),
        tone: late > 0 ? "amber" : "ink",
        to: "/suppliers"
      }
    }
    case "ticket": {
      // A ticket's deadline is a day, as the tickets screens read it: it sits above the clock, not at midnight.
      const day = dayKey(r.at)
      return {
        id: r.id,
        kind: "ticket",
        at: dayStart(day),
        minutes: 0,
        allDay: true,
        title: r.number === null ? r.title : `#${r.number} ${r.title}`,
        detail: "Deadline",
        tone: day < dayKey(Date.now()) ? "red" : "amber",
        to: `/tickets/${r.subjectId}`
      }
    }
    case "invite":
      return {
        id: r.id,
        kind: "invite",
        at: r.at,
        minutes: 15,
        title: r.past ? `Uitnodiging verlopen: ${r.title}` : `Uitnodiging verloopt: ${r.title}`,
        detail: "Opnieuw versturen houdt de plek vrij",
        tone: r.past ? "red" : "ink",
        to: "/settings/team"
      }
    case "todo":
      return {
        id: r.id,
        kind: "todo",
        at: r.at,
        minutes: 0,
        allDay: true,
        title: r.title,
        tone: "arc",
        to: "/dashboard",
        search: { view: "werk" }
      }
  }
}

/* ── Activiteit ────────────────────────────────────────────────────────────────────────────────── */

/** The record's noun, after a general verb: "wijzigde bestelling SO-1042". */
const NOUN: Record<string, string> = {
  order: "bestelling",
  customer: "klant",
  product: "product",
  quality_check: "de kwaliteitscontrole van",
  return: "retour",
  ticket: "ticket",
  supplier: "leverancier",
  member: "teamlid",
  invitation: "de uitnodiging van",
  role: "de rol",
  api_key: "API-sleutel",
  store: "winkel"
}

/** The general verbs, by the action's last part. */
const VERB: Record<string, string> = {
  created: "maakte",
  updated: "wijzigde",
  edited: "wijzigde",
  restored: "zette terug:",
  removed: "verwijderde",
  deleted: "verwijderde",
  tagged: "labelde",
  renamed: "hernoemde",
  approved: "keurde goed:",
  rejected: "wees af:",
  reopened: "heropende",
  cancelled: "annuleerde",
  accepted: "accepteerde",
  shipped: "verzond",
  requested: "vroeg aan:",
  submitted: "stuurde in:",
  assigned: "wees toe:",
  connected: "koppelde",
  disconnected: "ontkoppelde",
  reconnected: "koppelde opnieuw",
  synced: "synchroniseerde",
  revoked: "trok in:",
  rotated: "verving",
  paused: "pauzeerde",
  resumed: "hervatte",
  shopify_refused: "kreeg een weigering van Shopify bij"
}

/** Where the general verb does not read: the whole phrase before the record. */
const PHRASE: Record<string, string> = {
  "order.placed": "nieuwe bestelling",
  "order.delayed": "meldde vertraging bij",
  "order.forwarded": "stuurde door naar de leverancier:",
  "order.forward_cancelled": "trok het doorsturen in van",
  "order.forward_confirmed": "bevestigde het doorsturen van",
  "order.forward_rerouted": "stuurde naar een andere leverancier:",
  "order.fulfilled": "verwerkte",
  "order.late": "meldde dat het pakket stilstaat van",
  "order.note_set": "schreef een notitie bij",
  "order.note_cleared": "wiste de notitie bij",
  "order.problem": "meldde een probleem met",
  "order.refunded": "betaalde terug:",
  "order.refund_failed": "kon niet terugbetalen:",
  "order.shipping_updated": "werkte de verzending bij van",
  "order.supplier_accepted": "accepteerde",
  "order.supplier_problem": "meldde een probleem met",
  "order.supplier_shipped": "verzond",
  "customer.created": "voegde klant toe:",
  "customer.merged": "voegde klanten samen in",
  "customer.merged_away": "voegde samen:",
  "customer.unmerged": "haalde uit elkaar:",
  "product.phase_changed": "zette een andere fase voor",
  "product.repriced": "paste de prijs aan van",
  "product.status_changed": "wijzigde de status van",
  "quality_check.requested": "vroeg een kwaliteitscontrole aan voor",
  "quality_check.submitted": "stuurde een kwaliteitscontrole in voor",
  "quality_check.approved": "keurde de kwaliteitscontrole goed van",
  "quality_check.rejected": "keurde de kwaliteitscontrole af van",
  "return.new": "vroeg een retour aan:",
  "return.requested": "vroeg een retour aan:",
  "return.started": "begon aan retour",
  "return.inspected": "inspecteerde retour",
  "return.received": "ontving retour",
  "return.label": "maakte een retourlabel voor",
  "return.label_issued": "maakte een retourlabel voor",
  "return.label_requested": "vroeg een retourlabel aan voor",
  "return.tracking_added": "voegde track & trace toe aan",
  "return.resolution_requested": "vroeg de afhandeling aan van",
  "return.resolution_retried": "probeerde de afhandeling opnieuw van",
  "return.resolution_made": "handelde af:",
  "return.resolved": "sloot retour",
  "ticket.created": "maakte ticket",
  "ticket.commented": "reageerde op",
  "ticket.mentioned": "vermeldde iemand bij",
  "ticket.assigned": "wees toe:",
  "ticket.unassigned": "haalde een toewijzing weg bij",
  "ticket.snoozed": "zette op later:",
  "supplier.created": "voegde leverancier toe:",
  "supplier.api_connected": "koppelde de API van",
  "supplier.api_disconnected": "ontkoppelde de API van",
  "supplier.message": "stuurde een bericht over",
  "supplier.order": "kreeg een bestelling:",
  "supplier.products_assigned": "wees producten toe aan",
  "member.invited": "nodigde uit:",
  "member.joined": "kwam erbij",
  "member.deactivated": "deactiveerde",
  "member.reactivated": "activeerde opnieuw:",
  "member.removed": "haalde uit het team:",
  "member.restored": "zette terug in het team:",
  "member.role_changed": "wijzigde de rol van",
  "member.stores_changed": "wijzigde de winkels van",
  "member.invitation_declined": "sloeg de uitnodiging af",
  "member.invitation_resent": "verstuurde de uitnodiging opnieuw aan",
  "member.invitation_resend_undone": "draaide het opnieuw versturen terug voor",
  "member.invitation_restored": "zette de uitnodiging terug voor",
  "member.invitation_revoked": "trok de uitnodiging in van",
  "member.invitation_role_changed": "wijzigde de rol in de uitnodiging van",
  "member.invite_link_changed": "wijzigde de uitnodigingslink",
  "member.invite_link_regenerated": "maakte een nieuwe uitnodigingslink",
  "member.invite_link_regenerate_undone": "zette de uitnodigingslink terug",
  "role.reset": "zette terug naar de standaard: de rol",
  "role.updated": "wijzigde de rechten van de rol",
  "api_key.created": "maakte API-sleutel",
  "api_key.grace_ended": "sloot de overgang af van API-sleutel",
  "store.connected": "koppelde winkel",
  "store.disconnected": "ontkoppelde winkel",
  "store.synced": "synchroniseerde winkel"
}

const STATUS: Record<string, string> = {
  intake: "Nieuw",
  in_progress: "Mee bezig",
  awaiting_reply: "Wacht op antwoord",
  done: "Klaar"
}

/** The phrase after the actor's name, and the record's place in it. */
function phraseOf(r: ActivityRow): { readonly title: string; readonly detail?: string } {
  const diff = (typeof r.diff === "object" && r.diff !== null ? r.diff : {}) as Record<string, unknown>
  if (r.action === "ticket.status_changed") {
    const to = String(diff["to"] ?? "")
    return to === "done"
      ? { title: "sloot" }
      : { title: "zette een andere status voor", ...(STATUS[to] ? { detail: `Nu: ${STATUS[to]}` } : {}) }
  }
  const own = PHRASE[r.action]
  if (own !== undefined) return { title: own }
  const verb = VERB[r.action.slice(r.action.indexOf(".") + 1)] ?? "wijzigde"
  const noun = NOUN[r.subjectType]
  // "zette terug:" takes the record after the colon, without the noun.
  return { title: verb.endsWith(":") || noun === undefined ? verb : `${verb} ${noun}` }
}

/** Who did it, as the row's mark draws them; `undefined` where the sentence names them itself. */
function actorOf(r: ActivityRow): { readonly actor?: NoteActor; readonly lead?: string } {
  const id = r.actorKey.slice(r.actorKey.indexOf(":") + 1)
  switch (r.actorKind) {
    case "member":
      return { actor: { kind: "member", id, name: r.actorName ?? "Een oud-teamlid" } }
    case "shop":
      return { actor: { kind: "brand", brand: "shopify", name: "Shopify" } }
    case "supplier_contact":
      return { actor: { kind: "person", name: r.actorName ?? "De leverancier" } }
    case "agent":
    case "insyte":
      return { actor: { kind: "insyte" } }
    case "api_key":
    case "service_account":
      return { lead: "Een API-sleutel" }
    default:
      return { lead: "Het systeem" }
  }
}

/** Where a row opens: its record's page, or the list or settings that hold it. */
function linkOf(r: ActivityRow): Pick<Note, "to" | "search"> {
  const id = r.subjectId
  switch (r.subjectType) {
    case "order":
      return { to: `/orders/${id}` }
    case "customer":
      return { to: `/customers/${id}` }
    case "product":
      return { to: `/products/${id}` }
    case "quality_check": {
      const product = (r.diff as Record<string, unknown> | null)?.["productId"]
      return typeof product === "string"
        ? { to: `/products/${product}`, search: { tab: "quality", check: id } }
        : { to: "/products" }
    }
    case "return":
      return { to: `/returns/${id}` }
    case "ticket":
      return { to: `/tickets/${id}` }
    case "supplier":
      return { to: "/suppliers" }
    case "role":
      return { to: "/settings/roles" }
    case "api_key":
      return { to: "/settings/api-keys" }
    case "store":
      return { to: "/settings/stores" }
    default:
      return { to: "/settings/team" }
  }
}

/** One row of `Home.activity` as a line in the feed. */
export function noteOf(r: ActivityRow): Note {
  const { actor, lead } = actorOf(r)
  const { title, detail } = phraseOf(r)
  const placed = r.action === "order.placed"
  const money = r.amountMinor === null ? null : formatCurrency(r.amountMinor / 100, (r.currency ?? "EUR") as Currency)
  const facts = placed ? [r.customer, money].filter((t) => t !== null && t !== "").join(" · ") : detail
  return {
    id: r.id,
    persona: "admin",
    source: r.source as NoteSource,
    // The feed draws no event's own copy; the audited action stands in for one.
    event: r.action as EventKey,
    ...(actor === undefined ? {} : { actor }),
    title: lead === undefined ? title : `${lead} ${title}`,
    ...(r.label === null ? {} : { record: r.label }),
    ...(facts === undefined || facts === "" ? {} : { detail: facts }),
    ...(r.action.endsWith("_failed") || r.action.endsWith("shopify_refused") ? { tone: "red" as const } : {}),
    ...linkOf(r),
    at: new Date(r.at).toISOString(),
    read: true,
    state: "inbox"
  }
}
