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
