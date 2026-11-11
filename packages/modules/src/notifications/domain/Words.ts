/*
 * A note's words outside the app (M11 step 13.5): the mail's subject and lead, the record it is about and where its
 * button leads, in Dutch, as the console writes the same note in the bell (`apps/console/src/frame/notes.ts`). The
 * console's sentence follows the actor's name on screen; a mail says it whole.
 */

export interface NoteFacts {
  readonly kind: string
  readonly subjectType: string | null
  readonly subjectId: string | null
  /** The member who did it, by name as it is now; `null` for a service, a shopper or Insyte. */
  readonly actor: string | null
  readonly data: Record<string, unknown>
}

export interface NoteWords {
  readonly title: string
  readonly detail?: string | undefined
  readonly quote?: string | undefined
  readonly record?: string | undefined
  readonly actionLabel: string
  /** A console path, with its search. */
  readonly path: string
}

const text = (
  value: unknown
) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value))

const query = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`

export const wordsOf = (note: NoteFacts): NoteWords => {
  const { data } = note
  const who = note.actor ?? "Iemand"
  const id = note.subjectId ?? ""
  switch (note.kind) {
    case "team.invite":
      return {
        title: data["via"] === "link"
          ? `${who} kwam erbij via de uitnodigingslink`
          : `${who} accepteerde je uitnodiging`,
        actionLabel: "Team bekijken",
        path: "/settings/team"
      }
    case "team.access":
      return data["state"] === "open"
        ? { title: `${who} vraagt om meer rechten`, actionLabel: "Verzoek bekijken", path: "/settings/roles" }
        : data["state"] === "granted"
        ? { title: `${who} gaf je meer rechten`, actionLabel: "Team bekijken", path: "/settings/team" }
        : { title: `${who} wees je verzoek om meer rechten af`, actionLabel: "Team bekijken", path: "/settings/team" }
    case "order.late": {
      const exception = data["reason"] === "exception"
      const number = text(data["number"])
      return {
        title: exception
          ? `De vervoerder meldt een probleem met bestelling ${number}`
          : `Het pakket van bestelling ${number} beweegt al drie dagen niet`,
        detail: text(data["note"]) !== ""
          ? text(data["note"])
          : exception
          ? "Bekijk de track & trace bij de bestelling."
          : "Vraag de vervoerder of de leverancier waar het blijft.",
        record: `Bestelling ${number}`,
        actionLabel: "Bestelling openen",
        path: `/orders/${id}`
      }
    }
    case "return.new": {
      const items = Array.isArray(data["items"]) ? data["items"] as Array<Record<string, unknown>> : []
      const what = items.map((i) =>
        `${text(i["qty"] ?? 1)}× ${text(i["title"])}${text(i["variant"]) === "" ? "" : ` (${text(i["variant"])})`}`
      )
      const customer = text(data["customer"]) || "Een klant"
      const order = text(data["orderNumber"])
      return {
        title: data["kind"] === "claim"
          ? `${customer} meldt een probleem met bestelling ${order}`
          : `${customer} wil iets terugsturen uit bestelling ${order}`,
        detail: what.join(", ") || undefined,
        record: `Retour ${text(data["number"])}`,
        actionLabel: "Retour openen",
        path: `/returns/${id}`
      }
    }
    case "ticket.assigned":
      return {
        title: `${who} heeft je toegewezen aan ticket #${text(data["number"])}`,
        detail: text(data["title"]) || undefined,
        record: `Ticket #${text(data["number"])}`,
        actionLabel: "Ticket openen",
        path: `/tickets${query({ ticket: id })}`
      }
    case "chat.mention":
      // In a chat (M11 step 4): `#kanaal` or a DM, which the button opens.
      if (note.subjectType === "conversation") {
        return {
          title: typeof data["conversation"] === "string"
            ? `${who} heeft je vermeld in #${data["conversation"]}`
            : `${who} heeft je vermeld in een privébericht`,
          quote: text(data["comment"]) || undefined,
          actionLabel: "Bericht bekijken",
          path: `/chats${query({ id })}`
        }
      }
      return {
        title: `${who} heeft je vermeld bij ticket #${text(data["number"])}`,
        detail: text(data["title"]) || undefined,
        quote: text(data["comment"]) || undefined,
        record: `Ticket #${text(data["number"])}`,
        actionLabel: "Reactie bekijken",
        path: `/tickets${query({ ticket: id })}`
      }
    case "supplier.message": {
      const photos = Number(data["photos"] ?? 0)
      const parts = [
        `${photos} ${photos === 1 ? "foto" : "foto's"}`,
        ...(text(data["batch"]) === "" ? [] : [`batch ${text(data["batch"])}`]),
        ...(data["video"] === true ? ["video"] : [])
      ]
      return {
        title: `${text(data["by"]) || "De leverancier"} stuurde een kwaliteitscontrole in voor ${
          text(data["product"])
        }`,
        detail: parts.join(" · "),
        record: text(data["supplier"]) || undefined,
        actionLabel: "Controle bekijken",
        path: `/products/${text(data["productId"])}${query({ tab: "quality", check: id })}`
      }
    }
    default:
      return { title: "Er is een nieuwe melding voor je", actionLabel: "Meldingen openen", path: "/notifications" }
  }
}
