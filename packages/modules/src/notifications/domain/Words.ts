import { triedSummary } from "../../stores/domain/Health.ts"
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

/** A chargeback's reasons as the case names them (`chargebacks/domain/Chargebacks.ts` `ReasonCode`). */
const REASON: Record<string, string> = {
  unauthorized: "Niet-geautoriseerde transactie",
  not_received: "Niet ontvangen",
  wrong_item: "Verkeerd artikel verzonden",
  not_as_described: "Product niet zoals beschreven",
  refund_requested: "Terugbetaling aangevraagd",
  service: "Service niet naar tevredenheid",
  payment_dispute: "Betalingsgeschil"
}

/** How long is left, as each deadline reminder says it (five days, two days, six hours). */
const DEADLINE: Record<string, string> = {
  "5d": "Nog vijf dagen om bewijs in te dienen.",
  "2d": "Nog twee dagen om bewijs in te dienen.",
  "6h": "Nog zes uur om bewijs in te dienen, anders vervalt het geschil in het voordeel van de klant."
}

/** The disputed amount in its own currency: "€ 49,95". */
const disputed = (data: Record<string, unknown>) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: text(data["currency"]) || "EUR" }).format(
    Number(data["amountMinor"] ?? 0) / 100
  )

/** "november 2026" for `2026-11`; the input as it is when it is not a month. */
export const monthName = (month: string) =>
  /^\d{4}-\d{2}$/.test(month)
    ? new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${month}-15T12:00:00Z`))
    : month

/** "15 december" for `2026-12-15`. */
export const dayName = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(`${day}T12:00:00Z`))
    : day

/** Minor units in a currency, as the console writes money. */
export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(minor / 100)

/**
 * An AI budget at its warning or its limit (M15 step 1), as the bell and the mail both say it: whose budget, how much of
 * it is used, the figures, and what follows. The design's own words (`stores/autonomy-store.ts`).
 */
export const budgetWords = (data: Record<string, unknown>) => {
  const usedCents = Number(data["usedCents"] ?? 0)
  const limit = Number(data["limit"] ?? 0)
  const reached = data["level"] === "reached"
  const who = data["scope"] === "member" ? text(data["name"]) || "iemand" : "de werkruimte"
  const pct = limit > 0 ? Math.round(usedCents / limit) : 100
  return {
    /** The sentence after "Insyte ziet dat". */
    said: reached
      ? `${who} het AI-budget voor deze maand heeft bereikt`
      : `${who} ${pct}% van het AI-budget heeft gebruikt`,
    record: `€${Math.round(usedCents / 100)} van €${limit}`,
    detail: reached
      ? "Insyte handelt niet meer zelf tot de maand omslaat of de limiet omhoog gaat."
      : "Bij 100% komt alles als voorstel. Je kunt de limiet verhogen onder Limieten."
  }
}

/**
 * A connection incident (M17 step 6): what is wrong with the store, and what Insyte already tried, as the health check
 * wrote them (`stores/domain/Health.ts`); the button leads to Winkels.
 */
const incidentWords = (data: Record<string, unknown>): NoteWords => {
  const tried = Array.isArray(data["tried"]) ? data["tried"].map(text).filter((t) => t !== "") : []
  return {
    title: `De koppeling met ${text(data["store"]) || "je winkel"} vraagt aandacht`,
    detail: [text(data["finding"]), triedSummary(tried)]
      .filter((t) => t !== "")
      .join(" "),
    record: text(data["store"]) || undefined,
    actionLabel: "Winkels bekijken",
    path: `/settings/stores${query({ store: text(data["storeId"]) })}`
  }
}

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
    case "chargeback.new": {
      // A chargeback at or above the threshold (M13 step 3): opened by a teammate by hand, or by a provider later.
      const number = text(data["caseNumber"])
      return {
        title: note.actor === null ? `Nieuwe chargeback: ${number}` : `${who} opende chargeback ${number}`,
        detail: `${text(data["customer"])} betwist ${disputed(data)}${
          REASON[text(data["reasonCode"])] === undefined ? "" : ` · ${REASON[text(data["reasonCode"])]}`
        }`,
        record: `Chargeback ${number}`,
        actionLabel: "Zaak openen",
        path: `/chargebacks/${id}`
      }
    }
    case "chargeback.deadline": {
      const number = text(data["caseNumber"])
      return {
        title: `De bewijsdeadline van ${number} nadert`,
        detail: DEADLINE[text(data["offset"])] ?? DEADLINE["2d"],
        record: `Chargeback ${number}`,
        actionLabel: "Zaak openen",
        path: `/chargebacks/${id}`
      }
    }
    case "integration.sync":
    case "integration.disconnected":
      if (note.subjectType === "connection_incident") return incidentWords(data)
      if (note.kind === "integration.sync") break
      // A webhook endpoint Insyte switched off (M19.4).
      return {
        title: "Insyte heeft een webhook-endpoint uitgezet",
        detail: "Na 5 mislukte leveringen op rij. Er gaan geen events meer heen tot je het weer aanzet.",
        record: text(data["url"]) || undefined,
        actionLabel: "Endpoint bekijken",
        path: `/settings/webhooks${query({ endpoint: id })}`
      }
    case "course.assigned":
      return {
        title: data["reminder"] === true
          ? `${who} herinnert je aan de cursus “${text(data["title"])}”`
          : `${who} zette de cursus “${text(data["title"])}” voor je klaar`,
        detail: text(data["deadline"]) === "" ? undefined : `Graag af voor ${text(data["deadline"])}.`,
        record: text(data["title"]) || undefined,
        actionLabel: "Cursus openen",
        path: `/courses/learn/${id}`
      }
    case "course.question":
      return {
        title: `${who} stelt een vraag bij de cursus “${text(data["title"])}”`,
        quote: text(data["comment"]) || undefined,
        record: text(data["title"]) || undefined,
        actionLabel: "Vraag beantwoorden",
        path: `/courses${query({ view: "questions" })}`
      }
    case "course.answered":
      return {
        title: `${who} beantwoordde je vraag bij de cursus “${text(data["title"])}”`,
        quote: text(data["comment"]) || undefined,
        record: text(data["title"]) || undefined,
        actionLabel: "Cursus openen",
        path: `/courses/learn/${id}`
      }
    case "supplier.delay": {
      // From a supplier's portal (M16 step 2): a problem it reported, or a parcel Shopify refused.
      const number = text(data["number"])
      const supplier = text(data["supplier"]) || "De leverancier"
      if (data["what"] === "refused") {
        return {
          title: `Verzending van ${number} kon niet worden doorgezet naar Shopify`,
          detail: `${supplier} markeerde het pakket als verzonden; Shopify weigerde de fulfilment.`,
          record: supplier,
          actionLabel: "Bestelling openen",
          path: `/orders/${id}`
        }
      }
      return {
        title: `${text(data["by"]) || supplier} meldt een probleem met ${number}`,
        quote: text(data["note"]) || undefined,
        detail: text(data["newDate"]) === "" ? undefined : `Nieuwe datum: ${text(data["newDate"])}`,
        record: supplier,
        actionLabel: "Bestelling openen",
        path: `/orders/${id}`
      }
    }
    case "supplier.statement": {
      const count = Number(data["count"] ?? 0)
      return {
        title: `De afrekeningen van ${monthName(text(data["month"]))} staan klaar`,
        detail: `${count} ${count === 1 ? "leverancier" : "leveranciers"}, samen ${
          money(Number(data["totalMinor"] ?? 0), text(data["currency"]) || "EUR")
        }. Betaling op ${dayName(text(data["payDay"]))}.`,
        actionLabel: "Leveranciers openen",
        path: "/suppliers"
      }
    }
    case "data.export": {
      // The member's export is written, or could not be (M14 step 5); the file downloads for seven days.
      const rows = Number(data["rows"] ?? 0)
      return data["state"] === "failed"
        ? {
          title: "Je export is mislukt",
          detail: data["reason"] === "too_many_rows"
            ? "Er zijn meer dan 1.000.000 rijen. Verfijn het filter en probeer het opnieuw."
            : "Probeer het opnieuw. Lukt het weer niet, laat het ons weten.",
          record: text(data["fileName"]) || undefined,
          actionLabel: "Exporteren openen",
          path: `/data${query({ view: "export" })}`
        }
        : {
          title: "Je export staat klaar",
          detail: `${rows.toLocaleString("nl-NL")} ${
            rows === 1 ? "rij" : "rijen"
          }. De download blijft zeven dagen staan.`,
          record: text(data["fileName"]) || undefined,
          actionLabel: "Export downloaden",
          path: `/data${query({ view: "export" })}`
        }
    }
    case "insyte.budget": {
      const b = budgetWords(data)
      return {
        title: `Insyte ziet dat ${b.said}`,
        detail: b.detail,
        record: b.record,
        actionLabel: "Limieten openen",
        path: "/settings/ai/limits"
      }
    }
  }
  return { title: "Er is een nieuwe melding voor je", actionLabel: "Meldingen openen", path: "/notifications" }
}
