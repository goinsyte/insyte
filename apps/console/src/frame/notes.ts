import { type AreaId, type Level } from "@insyte/domain/Permissions"
import type { Note as ServerNote } from "@insyte/modules/notifications/domain/Notifications"
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
  /** Who it is from when that is not a teammate: the shopper of a return. */
  readonly person?: string
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
    default:
      return { title: "heeft iets voor je", to: "/notifications" }
  }
}

export const toNote = (note: ServerNote): Note => {
  const { title, to, detail, record, tone, source, person } = sentence(note)
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
      : { actor: { kind: "person", name: person } }),
    title,
    ...(detail === undefined ? {} : { detail }),
    to,
    at: new Date(note.createdAt).toISOString(),
    read: note.read,
    state: note.state,
    ...(note.snoozedUntil === null ? {} : { snoozeUntil: new Date(note.snoozedUntil).toISOString() })
  }
}
