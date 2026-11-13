import { type AreaId, type Level } from "@insyte/domain/Permissions"
import type { Note as ServerNote } from "@insyte/modules/notifications/domain/Notifications"
import { dayName, money, monthName } from "@insyte/modules/notifications/domain/Words"
import type { EventKey, Note } from "@insyte/ui/app/lib/notifications"
import { permissionName } from "@insyte/ui/app/lib/permissions"

/*
 * A notification as the bell and the inbox draw it (M5.2): the server keeps the kind, the actor and the figures; the
 * console writes the sentence, in Dutch, and where the row leads.
 */

interface Sentence {
  readonly title: string
  readonly to: string
  readonly detail?: string
  /** The record named after the title (an order number), and the row's tone, as the design writes a late order. */
  readonly record?: string
  readonly tone?: "amber"
  readonly source?: Note["source"]
  /** Who it is from when that is not a teammate: the shopper of a return, a supplier's person. */
  readonly person?: string
  readonly org?: string
  /** The route's search, where the row opens over a list (`?ticket=`) or a tab (`?tab=quality&check=`). */
  readonly search?: Record<string, string>
  /** Why it reached the member directly, and whether the detail is their teammate's own words. */
  readonly reason?: Note["reason"]
  readonly quote?: boolean
}

/** A chargeback's reasons as the case names them. */
const REASON: Record<string, string> = {
  unauthorized: "Niet-geautoriseerde transactie",
  not_received: "Niet ontvangen",
  wrong_item: "Verkeerd artikel verzonden",
  not_as_described: "Product niet zoals beschreven",
  refund_requested: "Terugbetaling aangevraagd",
  service: "Service niet naar tevredenheid",
  payment_dispute: "Betalingsgeschil"
}

/** How long is left, as each deadline reminder says it. */
const DEADLINE: Record<string, string> = {
  "5d": "Nog vijf dagen om bewijs in te dienen.",
  "2d": "Nog twee dagen om bewijs in te dienen.",
  "6h": "Nog zes uur om bewijs in te dienen, anders vervalt het geschil in het voordeel van de klant."
}

const disputed = (data: Record<string, unknown>) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: String(data["currency"] ?? "") || "EUR" }).format(
    Number(data["amountMinor"] ?? 0) / 100
  )

const sentence = (note: ServerNote): Sentence => {
  const data = (note.data ?? {}) as Record<string, unknown>
  switch (note.kind) {
    case "team.invite":
      return {
        title: data["via"] === "link" ? "kwam erbij via de uitnodigingslink" : "accepteerde je uitnodiging",
        to: "/settings/team"
      }
    case "team.access": {
      const perm = permissionName(data["area"] as AreaId, data["level"] as Level)
      return data["state"] === "open"
        ? { title: "vraagt om meer rechten", detail: perm, to: "/settings/roles" }
        : data["state"] === "granted"
        ? { title: "gaf je meer rechten", detail: perm, to: "/settings/team" }
        : { title: "wees je verzoek om meer rechten af", detail: perm, to: "/settings/team" }
    }
    case "order.late": {
      // A stuck parcel (M8.4): a carrier exception, or no movement for days.
      const exception = data["reason"] === "exception"
      return {
        title: exception ? "De vervoerder meldt een probleem met" : "Het pakket beweegt al drie dagen niet:",
        record: String(data["number"] ?? ""),
        detail: typeof data["note"] === "string" && data["note"] !== ""
          ? data["note"]
          : exception
          ? "Bekijk de track & trace bij de bestelling."
          : "Vraag de vervoerder of de leverancier waar het blijft.",
        tone: "amber",
        source: "order",
        to: `/orders/${note.subjectId ?? ""}`
      }
    }
    case "return.new": {
      // A shopper's request from the returns portal (M9.3), as the design writes it.
      const items = Array.isArray(data["items"]) ? data["items"] as Array<Record<string, unknown>> : []
      const what = items.map((i) =>
        `${String(i["qty"] ?? 1)}× ${String(i["title"] ?? "")}${i["variant"] ? ` (${String(i["variant"])})` : ""}`
      )
      return {
        title: data["kind"] === "claim" ? "meldt een probleem met" : "wil iets terugsturen uit",
        record: String(data["orderNumber"] ?? ""),
        detail: [String(data["number"] ?? ""), what.join(", ")].filter((t) => t !== "").join(" · "),
        source: "return",
        to: `/returns/${note.subjectId ?? ""}`,
        person: String(data["customer"] ?? "") || "Een klant"
      }
    }
    case "ticket.assigned":
      // Someone put the member on a ticket (M11 step 3), as the design writes it; the row opens it over the board.
      return {
        title: "heeft je toegewezen aan",
        record: `#${String(data["number"] ?? "")}`,
        detail: String(data["title"] ?? ""),
        source: "ticket",
        to: "/tickets",
        search: { ticket: note.subjectId ?? "" },
        reason: "assign"
      }
    case "chat.mention":
      // A teammate named the member in a chat (M11 step 4): `#kanaal`, or a DM, which the row opens.
      if (note.subjectType === "conversation") {
        return {
          title: "heeft je vermeld in",
          record: typeof data["conversation"] === "string" ? `#${data["conversation"]}` : "een privébericht",
          detail: String(data["comment"] ?? ""),
          source: "mention",
          to: "/chats",
          search: { id: note.subjectId ?? "" },
          reason: "mention",
          quote: true
        }
      }
      // Or in a ticket's comment (M11 step 3).
      return {
        title: "heeft je vermeld bij",
        record: `#${String(data["number"] ?? "")}`,
        detail: String(data["comment"] ?? ""),
        source: "mention",
        to: "/tickets",
        search: { ticket: note.subjectId ?? "" },
        reason: "mention",
        quote: true
      }
    case "automation.alert":
    case "automation.failed":
      // A run of a flow (M12 step 3): its "Team waarschuwen", or that it failed; the row opens the flow's runs.
      return {
        title: note.kind === "automation.alert" ? "vraagt je aandacht in" : "kon een run niet afmaken in",
        record: String(data["name"] ?? ""),
        detail: String(data["detail"] ?? ""),
        source: "automation",
        to: `/automations/${note.subjectId ?? ""}`,
        search: { tab: "runs" },
        person: "Automatisering"
      }
    case "supplier.message": {
      // A supplier's answer to a quality check, through its link (M9.4), as the design writes it.
      const photos = Number(data["photos"] ?? 0)
      const parts = [
        `${photos} ${photos === 1 ? "foto" : "foto's"}`,
        ...(typeof data["batch"] === "string" && data["batch"] !== "" ? [`batch ${data["batch"]}`] : []),
        ...(data["video"] === true ? ["video"] : [])
      ]
      return {
        title: "stuurde een kwaliteitscontrole in voor",
        record: String(data["product"] ?? ""),
        detail: parts.join(" · "),
        source: "supplier",
        to: `/products/${String(data["productId"] ?? "")}`,
        search: { tab: "quality", check: note.subjectId ?? "" },
        person: String(data["by"] ?? "") || "De leverancier",
        org: String(data["supplier"] ?? "")
      }
    }
    case "chargeback.new": {
      // A chargeback at or above the threshold (M13 step 3), as the design writes it; one a teammate opened by hand
      // follows their name.
      const reason = REASON[String(data["reasonCode"] ?? "")]
      return {
        title: note.actor?.kind === "member" ? "opende een chargeback:" : "Nieuwe chargeback boven je drempel:",
        record: String(data["caseNumber"] ?? ""),
        detail: `${String(data["customer"] ?? "")} betwist ${disputed(data)}${
          reason === undefined ? "" : ` · ${reason}`
        }`,
        source: "chargeback",
        to: `/chargebacks/${note.subjectId ?? ""}`
      }
    }
    case "chargeback.deadline":
      // Five days, two days or six hours before a case's deadline (M13 step 3).
      return {
        title: "Bewijsdeadline nadert voor",
        record: String(data["caseNumber"] ?? ""),
        detail: DEADLINE[String(data["offset"] ?? "")] ?? DEADLINE["2d"]!,
        tone: "amber",
        source: "chargeback",
        to: `/chargebacks/${note.subjectId ?? ""}`
      }
    case "integration.disconnected":
      // A webhook endpoint Insyte switched off after five failed attempts in a row (M19.4).
      return {
        title: "Insyte heeft een webhook-endpoint uitgezet:",
        record: String(data["url"] ?? ""),
        detail: "Na 5 mislukte leveringen op rij. Er gaan geen events meer heen tot je het weer aanzet.",
        tone: "amber",
        source: "integration",
        to: "/settings/webhooks",
        search: { endpoint: note.subjectId ?? "" }
      }
    case "course.assigned":
      // A course for the member (M17 step 4): published for them, or a teammate reminds them; the row opens it.
      return {
        title: data["reminder"] === true ? "herinnert je aan de cursus" : "zette een cursus voor je klaar:",
        record: String(data["title"] ?? ""),
        ...(typeof data["deadline"] === "string" && data["deadline"] !== ""
          ? { detail: `Deadline ${String(data["deadline"])}` }
          : {}),
        to: `/courses/learn/${note.subjectId ?? ""}`,
        reason: "assign"
      }
    case "course.question":
      return {
        title: "stelt een vraag bij",
        record: String(data["title"] ?? ""),
        detail: String(data["comment"] ?? ""),
        to: "/courses",
        search: { view: "questions" },
        quote: true
      }
    case "course.answered":
      return {
        title: "beantwoordde je vraag bij",
        record: String(data["title"] ?? ""),
        detail: String(data["comment"] ?? ""),
        to: `/courses/learn/${note.subjectId ?? ""}`,
        quote: true
      }
    case "supplier.statement": {
      // The month's supplier statements closed (M13 step 6): what is to be paid, and when.
      const count = Number(data["count"] ?? 0)
      return {
        title: "De afrekeningen staan klaar voor",
        record: monthName(String(data["month"] ?? "")),
        detail: `${count} ${count === 1 ? "leverancier" : "leveranciers"}, samen ${
          money(Number(data["totalMinor"] ?? 0), String(data["currency"] ?? "") || "EUR")
        }. Betaling op ${dayName(String(data["payDay"] ?? ""))}.`,
        source: "supplier",
        to: "/suppliers"
      }
    }
    case "data.export": {
      // The member's export is written, or could not be (M14 step 5); the row opens Exporteren with its download.
      const rows = Number(data["rows"] ?? 0)
      return data["state"] === "failed"
        ? {
          title: "Je export is mislukt:",
          record: String(data["fileName"] ?? ""),
          detail: "Probeer het opnieuw.",
          tone: "amber",
          source: "insyte",
          to: "/data",
          search: { view: "export" }
        }
        : {
          title: "Je export staat klaar:",
          record: String(data["fileName"] ?? ""),
          detail: `${rows.toLocaleString("nl-NL")} ${rows === 1 ? "rij" : "rijen"} · zeven dagen te downloaden`,
          source: "insyte",
          to: "/data",
          search: { view: "export" }
        }
    }
    default:
      return { title: "heeft iets voor je", to: "/notifications" }
  }
}

export const toNote = (note: ServerNote): Note => {
  const { title, to, detail, record, tone, source, person, org, search, reason, quote } = sentence(note)
  return {
    id: note.id,
    persona: "admin",
    source: source ?? "team",
    ...(record === undefined ? {} : { record }),
    ...(tone === undefined ? {} : { tone }),
    event: note.kind as EventKey,
    ...(note.actor?.kind === "member"
      ? { actor: { kind: "member", id: note.actor.id, name: note.actor.name ?? "Iemand" } }
      : person === undefined
      ? {}
      : { actor: { kind: "person", name: person, ...(org === undefined || org === "" ? {} : { org }) } }),
    title,
    ...(detail === undefined ? {} : { detail }),
    ...(reason === undefined ? {} : { reason }),
    ...(quote === undefined ? {} : { quote }),
    to,
    ...(search === undefined ? {} : { search }),
    at: new Date(note.createdAt).toISOString(),
    read: note.read,
    state: note.state,
    ...(note.snoozedUntil === null ? {} : { snoozeUntil: new Date(note.snoozedUntil).toISOString() })
  }
}
