import { webhookEventLabel } from "@insyte/domain/Webhooks"
import { Schema } from "effect"

/*
 * The Logboek (M17 step 20.1a; domain.md §16.1, widgets/05 §7.7): the workspace's settings changes as lines of "who
 * changed what, from what to what, on which page". Read from `audit_events` where `section` is set. Times are epoch
 * milliseconds; an actor is named by its key `<kind>:<id>`.
 */

/** Which audit lines: the settings pages' (`section` set). More categories join as their readers do. */
export const AuditCategory = Schema.Literals(["settings"])

/** The newest lines first, a page at a time, narrowed to a period, a person and a page. */
export const ListInput = Schema.Struct({
  category: AuditCategory,
  /** Only the last so many days; absent is everything still kept. */
  days: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 400 }))),
  /** An actor's key, as the facets name it. */
  actor: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  /** A page's id, as the facets name it. */
  page: Schema.optional(Schema.String.check(Schema.isMaxLength(60))),
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(400)))
})
export type ListInput = typeof ListInput.Type

/** The same narrowing, written out as a CSV. */
export const ExportInput = Schema.Struct({
  category: AuditCategory,
  days: ListInput.fields.days,
  actor: ListInput.fields.actor,
  page: ListInput.fields.page
})
export type ExportInput = typeof ExportInput.Type

export const AuditActor = Schema.Struct({ key: Schema.String, name: Schema.String })
export type AuditActor = typeof AuditActor.Type

/**
 * One changed field, "Taal: Nederlands → English", or one event, "API-sleutel aangemaakt: Boekhouding" (`before`
 * `null`: nothing it was), by whom, when, on which page (and where that page is).
 */
export const AuditLine = Schema.Struct({
  id: Schema.String,
  at: Schema.Finite,
  actor: AuditActor,
  page: Schema.String,
  path: Schema.NullOr(Schema.String),
  field: Schema.String,
  before: Schema.NullOr(Schema.String),
  after: Schema.String
})
export type AuditLine = typeof AuditLine.Type

export const AuditPage = Schema.Struct({ lines: Schema.Array(AuditLine), next: Schema.NullOr(Schema.String) })
export type AuditPage = typeof AuditPage.Type

export const AuditFacets = Schema.Struct({
  actors: Schema.Array(AuditActor),
  pages: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String }))
})
export type AuditFacets = typeof AuditFacets.Type

export const AuditExport = Schema.Struct({
  filename: Schema.String,
  csv: Schema.String,
  /** Lines written; `truncated` when the export stopped at its cap. */
  lines: Schema.Int,
  truncated: Schema.Boolean
})
export type AuditExport = typeof AuditExport.Type

/* ── how a line reads ─────────────────────────────────────────────────────────────────────────── */

/** A settings page as the Logboek names and links it. */
export interface LogPage {
  readonly id: string
  readonly label: string
  readonly path: string
}

const PAGE = {
  account: { id: "account", label: "Account", path: "/settings/profile" },
  regional: { id: "regional", label: "Regio", path: "/settings/regional" },
  team: { id: "team", label: "Team", path: "/settings/team" },
  roles: { id: "roles", label: "Rollen", path: "/settings/roles" },
  notifications: { id: "notifications", label: "Meldingen", path: "/settings/notifications" },
  shipping: { id: "shipping", label: "Verzending", path: "/settings/shipping" },
  returns: { id: "returns", label: "Retouren", path: "/settings/returns" },
  templates: { id: "templates", label: "Sjablonen", path: "/settings/templates" },
  brand: { id: "brand", label: "Huisstijl", path: "/settings/brand" },
  domain: { id: "domain", label: "E-mail en domein", path: "/settings/email-domain" },
  vat: { id: "vat", label: "Btw", path: "/settings/vat" },
  autonomy: { id: "autonomy", label: "Zelfstandigheid", path: "/settings/ai/autonomy" },
  customerAgent: { id: "customer-agent", label: "Klantagent", path: "/settings/ai/customer-agent" },
  knowledge: { id: "knowledge", label: "Kennisbank", path: "/settings/ai/knowledge" },
  limits: { id: "limits", label: "Limieten", path: "/settings/ai/limits" },
  apiKeys: { id: "api-keys", label: "API-sleutels", path: "/settings/api-keys" },
  webhooks: { id: "webhooks", label: "Webhooks", path: "/settings/webhooks" },
  privacy: { id: "privacy", label: "Gegevens en privacy", path: "/settings/privacy" },
  data: { id: "data", label: "Je gegevens", path: "/settings/data" }
} as const satisfies Record<string, LogPage>

/**
 * How one field reads: its label as its page has it (with the list item it belongs to, where it is one of many), and
 * its values as words. A field a writer logs and this catalogue lacks fails `audit-lines.test.ts`.
 */
export interface FieldSpec {
  /** The label; given the item (a status, a store, a reason), the label for that item's field. */
  readonly label: string | ((item: string) => string)
  /** The items of a list by their key, where the change does not name its item itself (`of`). */
  readonly items?: Readonly<Record<string, string>>
  /** A word per code. */
  readonly values?: Readonly<Record<string, string>>
  /** A value's words, where a table of codes does not do. */
  readonly format?: (value: unknown) => string
  /** A change that reads as what happened ("toegevoegd"), not as what it was and became. */
  readonly happened?: (before: unknown, after: unknown) => string
}

/** Where a section's changes are made, what its fields are called there, and what its events say. */
export interface SectionSpec {
  readonly page: LogPage
  /** The field's label, where the change is a whole value rather than per field. */
  readonly whole?: string
  readonly fields?: Readonly<Record<string, FieldSpec>>
  /** An action that is an event, not a change of a value: "API-sleutel aangemaakt", with its subject after it. */
  readonly events?: Readonly<Record<string, string>>
}

const ON_OFF = { true: "Aan", false: "Uit" }
const YES_NO = { true: "Ja", false: "Nee" }

/** A value as its page shows it: a word for a code, a unit for a number, "—" for nothing. */
const said = (value: unknown, spec?: FieldSpec): string => {
  if (value === undefined || value === "") return "—"
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map((v) => said(v, spec)).join(", ")
  const code = String(value)
  const word = spec?.values?.[code]
  if (word !== undefined) return word
  if (value === null) return "—"
  if (spec?.format !== undefined) return spec.format(value)
  if (typeof value === "boolean") return value ? "Aan" : "Uit"
  if (typeof value === "string" || typeof value === "number") return code
  return "gewijzigd"
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const unit = (one: string, many: string) => (value: unknown) =>
  typeof value === "number" ? plural(value, one, many) : String(value)

/**
 * Made on first use: the first `Intl` formatter an isolate makes loads its locale's data, and at module scope that
 * counted against the API Worker's startup limit.
 */
const euroFormat: { whole?: Intl.NumberFormat; cents?: Intl.NumberFormat } = {}
/** "€ 20", or "€ 12,50" where there are cents. */
const euros = (amount: number): string =>
  Number.isInteger(amount)
    ? (euroFormat.whole ??= new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    })).format(amount)
    : (euroFormat.cents ??= new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })).format(amount)
const minorEuros = (value: unknown) => (typeof value === "number" ? euros(value / 100) : String(value))
const wholeEuros = (value: unknown) => (typeof value === "number" ? euros(value) : String(value))

const months = (value: unknown) =>
  typeof value !== "number"
    ? String(value)
    : value % 12 === 0
    ? plural(value / 12, "jaar", "jaar")
    : plural(value, "maand", "maanden")

/** A logo, an address or a text replaced: what happened to it, never the value itself. */
const addedOrNot = (before: unknown, after: unknown) =>
  before === null || before === undefined || before === ""
    ? "toegevoegd"
    : after === null || after === undefined || after === ""
    ? "weggehaald"
    : "vervangen"
const textChanged = (before: unknown, after: unknown) =>
  after === null || after === undefined || after === "" ? "leeggemaakt" : before ? "aangepast" : "ingevuld"

/** The carrier statuses as Verzending names them. */
const CARRIER_STATUS: Readonly<Record<string, string>> = {
  info: "Label aangemaakt",
  supplier: "Bij de leverancier",
  country: "Onderweg naar het land",
  local: "Bij de lokale vervoerder",
  noinfo: "Nog geen info van de vervoerder",
  transit: "Onderweg",
  pickup: "Klaar om op te halen",
  out: "Wordt vandaag bezorgd",
  failed: "Bezorging mislukt",
  exception: "Probleem met de zending",
  stale: "Geen updates meer",
  delivered: "Bezorgd"
}

const RETENTION_CLASS: Readonly<Record<string, string>> = {
  contact: "Klantcontact",
  uploads: "Bijlagen",
  logs: "Logboeken",
  ads: "Advertentielog",
  courses: "Cursusvoortgang",
  customers: "Klantgegevens"
}

/** The agent's actions as Zelfstandigheid names them. */
const AGENT_ACTION: Readonly<Record<string, string>> = {
  SetTicketStatus: "Ticketstatus wijzigen",
  SetPriority: "Prioriteit en deadline zetten",
  AssignTicket: "Toewijzen",
  AddNote: "Interne notitie toevoegen",
  ApplyLabel: "Label toevoegen",
  CreateTicket: "Ticket aanmaken",
  SnoozeThread: "Gesprek uitstellen",
  SendReply: "Klant beantwoorden",
  ForwardOrder: "Bestelling doorsturen naar leverancier",
  CancelOrder: "Bestelling annuleren",
  ApproveReturn: "Retour goedkeuren",
  SendReturnLabel: "Retourlabel versturen",
  MessageSupplier: "Leverancier berichten",
  RequestQualityCheck: "Kwaliteitscontrole aanvragen",
  PostChatMessage: "Bericht in teamchat plaatsen",
  RefundOrder: "Terugbetalen",
  SubmitEvidence: "Chargeback-bewijs indienen",
  AcceptDispute: "Geschil accepteren"
}

/** The notification kinds as Meldingen names them. */
const NOTIFICATION_KIND: Readonly<Record<string, string>> = {
  "order.late": "Bestelling te laat",
  "order.refund": "Terugbetaald of geannuleerd",
  "order.note": "Notitie of label",
  "return.new": "Nieuwe retour of claim",
  "return.received": "Pakket ontvangen",
  "ticket.assigned": "Ticket aan jou toegewezen",
  "ticket.reply": "Klant antwoordt",
  "ticket.sla": "Termijn dreigt te verlopen",
  "chat.handover": "Websitechat overgedragen",
  "chargeback.new": "Nieuwe chargeback",
  "chargeback.deadline": "Bewijsdeadline nadert",
  "chargeback.result": "Uitspraak",
  "supplier.delay": "Vertraging gemeld",
  "supplier.message": "Bericht van een leverancier",
  "supplier.stock": "Voorraad bijna op",
  "supplier.statement": "Afrekeningen klaar",
  "affiliate.application": "Nieuwe aanmelding",
  "automation.failed": "Uitvoering mislukt",
  "automation.done": "Flow aangezet of gepauzeerd",
  "automation.alert": "Waarschuwing uit een flow",
  "chat.mention": "Vermelding",
  "team.invite": "Uitnodigingen",
  "team.access": "Toegangsverzoeken",
  "course.assigned": "Cursus voor jou",
  "course.question": "Vraag bij een cursus",
  "course.answered": "Antwoord op je vraag",
  "data.export": "Export klaar",
  "integration.disconnected": "Koppeling verbroken",
  "integration.sync": "Synchronisatie met fouten",
  "insyte.proposal": "Voorstel klaar",
  "insyte.draft": "Concepten opgesteld",
  "insyte.report": "Weekrapport",
  "insyte.action": "Actie mislukt of teruggedraaid",
  "insyte.budget": "AI-budget bijna op"
}

/** The areas and specials of a role as Rollen names them. */
const ROLE_AREA: Readonly<Record<string, string>> = {
  orders: "Bestellingen",
  returns: "Retouren",
  customers: "Klanten",
  products: "Producten",
  support: "Klantenservice",
  chargebacks: "Chargebacks",
  suppliers: "Leveranciers",
  affiliates: "Affiliates",
  automations: "Automatiseringen",
  analytics: "Analyse",
  data: "Data en export",
  settings: "Instellingen",
  team: "Team en rollen",
  billing: "Facturatie",
  integrations: "Koppelingen en API",
  courses: "Cursussen"
}
const ROLE_SPECIAL: Readonly<Record<string, string>> = {
  "refunds.write": "Terugbetalen",
  "disputes.write": "Chargeback-bewijs indienen",
  "data.export": "Exporteren",
  "customers.merge": "Klanten samenvoegen",
  "automations.publish": "Automatiseringen publiceren",
  "billing.invoices": "Facturen bekijken",
  "ai.autonomy": "Zelfstandigheid van Insyte AI",
  "returns.approve": "Retouren goedkeuren",
  "quality.approve": "Kwaliteitscontroles goedkeuren",
  "products.phase": "Productfase wijzigen",
  "costs.write": "Kosten bewerken"
}

const CHANNEL: Readonly<Record<string, string>> = {
  webchat: "Websitechat",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "E-mail"
}
const DAY: Readonly<Record<string, string>> = {
  "0": "Maandag",
  "1": "Dinsdag",
  "2": "Woensdag",
  "3": "Donderdag",
  "4": "Vrijdag",
  "5": "Zaterdag",
  "6": "Zondag"
}

const RESOLUTION: Readonly<Record<string, string>> = {
  refund: "Terugbetalen",
  exchange: "Ruilen",
  gift_card: "Cadeaubon",
  replacement: "Nieuw artikel",
  discount: "Kortingscode"
}

/** "Btw over verzending (Hoofdwinkel)": a field of one item in a list. */
const of = (label: string) => (item: string) => (item === "" ? label : `${label} (${item})`)

/** Every section the Logboek knows, by the `section` its writers set. */
export const SECTIONS = {
  account: {
    page: PAGE.account,
    fields: {
      name: { label: "Naam werkruimte" },
      legalEntity: { label: "Rechtspersoon" },
      vatNumber: { label: "Btw-nummer" },
      billingEmail: { label: "Factuur-e-mail" },
      country: { label: "Land" }
    }
  },
  alerts: {
    page: PAGE.account,
    fields: {
      delayHours: { label: "Late bestelling", format: unit("uur", "uur") },
      disputeAmountMinor: { label: "Groot geschil", format: (v) => (typeof v === "number" ? euros(v / 100) : "—") }
    }
  },
  retention: {
    page: PAGE.account,
    whole: "Gegevens leesbaar houden voor",
    fields: {
      retention: { label: "Gegevens leesbaar houden voor", format: unit("dag", "dagen") },
      // Gegevens en privacy's (`settings.retention.*`).
      months: {
        label: (item) => `Bewaartermijn ${item}`,
        items: RETENTION_CLASS,
        values: { null: "Geen termijn" },
        format: months
      },
      erasing: { label: "Elke nacht verwijderen", values: ON_OFF }
    },
    events: { "retention.erased": "Verwijderd na de bewaartermijn" }
  },
  regional: {
    page: PAGE.regional,
    fields: {
      language: {
        label: "Taal",
        values: {
          "nl-NL": "Nederlands",
          "en-US": "Engels (VS)",
          "en-GB": "Engels (VK)",
          "de-DE": "Duits",
          "fr-FR": "Frans"
        }
      },
      currencyDisplay: { label: "Valuta" },
      dateFormat: { label: "Datumnotatie" },
      timeFormat: { label: "Tijdnotatie", values: { "24h": "24-uurs", "12h": "12-uurs" } },
      weekStart: { label: "Week begint op", values: { mon: "Maandag", sun: "Zondag", sat: "Zaterdag" } },
      timezone: { label: "Tijdzone" }
    }
  },
  team: {
    page: PAGE.team,
    fields: {
      role: { label: "Rol" },
      stores: { label: "Winkels" },
      invitationRole: { label: "Rol in de uitnodiging" },
      linkOn: { label: "Uitnodigingslink", values: ON_OFF },
      linkRole: { label: "Rol via de uitnodigingslink" },
      linkDays: { label: "Uitnodigingslink geldig", format: unit("dag", "dagen") }
    },
    events: {
      "member.invited": "Uitnodiging verstuurd",
      "member.invitation_resent": "Uitnodiging opnieuw verstuurd",
      "member.invitation_resend_undone": "Opnieuw versturen teruggedraaid",
      "member.invitation_revoked": "Uitnodiging ingetrokken",
      "member.invitation_restored": "Uitnodiging teruggezet",
      "member.invitation_declined": "Uitnodiging afgeslagen",
      "member.invite_link_changed": "Uitnodigingslink gewijzigd",
      "member.invite_link_regenerated": "Nieuwe uitnodigingslink gemaakt",
      "member.invite_link_regenerate_undone": "Vorige uitnodigingslink teruggezet",
      "member.joined": "In het team gekomen",
      "member.left": "Het team verlaten",
      "member.deactivated": "Gedeactiveerd",
      "member.reactivated": "Weer geactiveerd",
      "member.removed": "Uit het team gehaald",
      "member.restored": "Terug in het team gezet",
      "workspace.ownership_transferred": "Eigenaarschap overgedragen"
    }
  },
  roles: {
    page: PAGE.roles,
    fields: {
      level: {
        label: (item) => item,
        items: ROLE_AREA,
        values: { 0: "Geen", 1: "Bekijken", 2: "Bewerken", 3: "Beheren" }
      },
      special: { label: (item) => item, items: ROLE_SPECIAL, values: ON_OFF },
      refundLimit: { label: "Terugbetalen tot", values: { null: "Geen grens" }, format: wholeEuros },
      stores: { label: "Winkels" },
      label: { label: "Naam" }
    },
    events: {
      "role.created": "Rol gemaakt",
      "role.renamed": "Rol hernoemd",
      "role.updated": "Rechten gewijzigd",
      "role.reset": "Rol teruggezet naar de standaard",
      "role.deleted": "Rol verwijderd",
      "role.restored": "Rol teruggezet"
    }
  },
  notifications: {
    page: PAGE.notifications,
    fields: {
      app: { label: (item) => `${item}: in de app`, items: NOTIFICATION_KIND, values: ON_OFF },
      email: { label: (item) => `${item}: e-mail`, items: NOTIFICATION_KIND, values: ON_OFF },
      push: { label: (item) => `${item}: mobiel push`, items: NOTIFICATION_KIND, values: ON_OFF },
      slack: { label: (item) => `${item}: Slack`, items: NOTIFICATION_KIND, values: ON_OFF },
      onlyMine: { label: (item) => `${item}: alleen als het mij betreft`, items: NOTIFICATION_KIND, values: ON_OFF },
      quietOn: { label: "Stille uren", values: ON_OFF },
      quietFrom: { label: "Stil vanaf" },
      quietTo: { label: "Stil tot" },
      quietWeekend: { label: "Weekend stil", values: ON_OFF },
      digestOn: { label: "Dagelijks overzicht", values: ON_OFF },
      digestAt: { label: "Overzicht om" },
      followAssigned: { label: "Volg automatisch: aan mij toegewezen", values: ON_OFF },
      followMentioned: { label: "Volg automatisch: waarin ik vermeld word", values: ON_OFF },
      followCreated: { label: "Volg automatisch: die ik heb gemaakt", values: ON_OFF },
      slackChannel: { label: "Slack-kanaal" }
    },
    events: {
      "notifications.prefs_changed": "Meldingen opgeslagen",
      "notifications.slack_connected": "Slack gekoppeld",
      "notifications.slack_disconnected": "Slack ontkoppeld",
      "notifications.push_subscribed": "Mobiel push aangezet",
      "notifications.push_unsubscribed": "Mobiel push uitgezet"
    }
  },
  // The settings-depth pages (`settings.<section>.<field>`, M17 step 20.1b).
  shipping: {
    page: PAGE.shipping,
    fields: {
      label: { label: (item) => `${item}: wat de klant leest`, items: CARRIER_STATUS },
      show: {
        label: (item) => `${item}: waar`,
        items: CARRIER_STATUS,
        values: { all: "Overal", line: "Alleen in de statusregel", hidden: "Niet tonen" }
      }
    }
  },
  returns: {
    page: PAGE.returns,
    fields: {
      returnDays: { label: "Retourtermijn", format: unit("dag", "dagen") },
      claimDays: { label: "Claimtermijn", format: unit("dag", "dagen") },
      offered: { label: "Aangeboden oplossingen", values: RESOLUTION },
      giftCardBonusPct: { label: "Bonus op een cadeaubon", format: (v) => `${String(v)}%` },
      exchangeFeeMinor: { label: "Ruilkosten", format: minorEuros },
      portalOn: { label: "Retourportaal", values: ON_OFF },
      portalIntro: { label: "Welkomsttekst van het portaal", happened: textChanged },
      portalDone: { label: "Tekst na de aanvraag", happened: textChanged },
      claimSteps: { label: "Claimstappen", happened: () => "aangepast" },
      rejectReasons: { label: "Redenen om af te wijzen", happened: () => "aangepast" },
      specialWindow: { label: of("Speciale termijn"), happened: addedOrNot },
      reason: { label: of("Reden"), happened: addedOrNot },
      reasonLabel: { label: of("Naam van de reden") },
      reasonClaim: { label: of("Soort reden"), values: { true: "Claim", false: "Retour" } },
      reasonPhoto: { label: of("Foto verplicht"), values: ON_OFF },
      reasonQuality: { label: of("Telt mee voor kwaliteit"), values: ON_OFF },
      reasonDays: { label: of("Eigen termijn"), values: { null: "Standaard" }, format: unit("dag", "dagen") },
      rule: { label: of("Productregel"), happened: addedOrNot },
      address: { label: of("Retouradres"), happened: addedOrNot }
    },
    events: { "returns.settings_updated": "Retourinstellingen opgeslagen" }
  },
  links: {
    page: PAGE.templates,
    fields: {
      review: { label: "Reviewlink" },
      unsubscribe: { label: "Uitschrijflink" },
      restock: { label: "Weer-op-voorraad-link" }
    }
  },
  brand: {
    page: PAGE.brand,
    fields: {
      logo: { label: "Logo", happened: addedOrNot },
      color: { label: "Merkkleur" },
      font: { label: "Lettertype in mails" },
      sender: { label: "Afzendernaam" },
      website: { label: "Website" },
      support: { label: "Supportadres" },
      widget: { label: "Chatvenster op de website", values: { right: "Rechtsonder", left: "Linksonder" } }
    }
  },
  domain_senders: {
    page: PAGE.domain,
    fields: {
      from: { label: "Mails van Insyte" },
      replyTo: { label: "Antwoorden naar" },
      domain: { label: "Domein" },
      records: { label: "DNS-records gevonden" }
    }
  },
  vat: {
    page: PAGE.vat,
    fields: {
      vatOnShipping: { label: of("Btw over verzending"), values: YES_NO },
      refundInclVat: { label: of("Terugbetalen met btw"), values: YES_NO },
      oss: { label: "OSS-registratie", values: { true: "Geregistreerd", false: "Niet geregistreerd" } },
      ossNumber: { label: "OSS-nummer" }
    }
  },
  autonomy: {
    page: PAGE.autonomy,
    fields: {
      level: {
        label: (item) => item,
        items: AGENT_ACTION,
        values: { auto: "Zelf doen", ask: "Eerst vragen", never: "Nooit" }
      },
      perDay: { label: of("Hoogstens per dag"), items: AGENT_ACTION, values: { null: "Geen grens" } },
      maxAmountMinor: {
        label: of("Hoogstens per keer"),
        items: AGENT_ACTION,
        values: { null: "Geen grens" },
        format: minorEuros
      }
    },
    events: { "autonomy_policy.changed": "Zelfstandigheid opgeslagen" }
  },
  customer_agent: {
    page: PAGE.customerAgent,
    fields: {
      on: { label: "Klantagent", values: ON_OFF },
      channel: {
        label: (item) => item,
        items: CHANNEL,
        values: { auto: "Zelf antwoorden", drafts: "Alleen concepten", off: "Uit" }
      },
      hours: {
        label: (item) => `Openingstijden ${item.toLowerCase()}`,
        items: DAY,
        format: (v) => {
          const h = v as { open?: boolean; from?: string; to?: string }
          return h.open === false ? "Gesloten" : `${h.from ?? ""}–${h.to ?? ""}`
        }
      },
      outside: {
        label: "Buiten openingstijden",
        values: { take: "Vraag aannemen", answer: "Antwoorden uit de kennisbank" }
      },
      unsure: { label: "Overdragen als Insyte twijfelt", values: ON_OFF },
      asksPerson: { label: "Overdragen als de klant om een mens vraagt", values: ON_OFF },
      topics: { label: "Altijd voor een collega" },
      afterMessages: { label: "Overdragen na zoveel berichten", values: { null: "Nooit" } },
      tone: { label: "Toon", values: { brand: "Zoals je merk", short: "Kort en vriendelijk", formal: "Formeel" } },
      handoverMessage: { label: "Bericht bij een overdracht", happened: textChanged }
    },
    events: { "customer_agent.changed": "Klantagent opgeslagen" }
  },
  knowledge: {
    page: PAGE.knowledge,
    events: {
      "knowledge_article.created": "Hoofdstuk gemaakt",
      "knowledge_article.draft_saved": "Concept opgeslagen",
      "knowledge_article.published": "Hoofdstuk gepubliceerd",
      "knowledge_article.restored": "Eerdere versie teruggezet",
      "knowledge_article.archived": "Hoofdstuk gearchiveerd",
      "knowledge_article.unarchived": "Hoofdstuk teruggezet",
      "knowledge_article.unpublished": "Publicatie teruggedraaid"
    }
  },
  ai_limits: {
    page: PAGE.limits,
    fields: {
      limit: {
        label: (item) => `Limiet per maand: ${item}`,
        items: { workspace: "werkruimte" },
        values: { null: "Geen limiet" },
        format: wholeEuros
      }
    },
    events: { "ai_budget.changed": "Limieten opgeslagen" }
  },
  api_keys: {
    page: PAGE.apiKeys,
    fields: { label: { label: "Naam van de sleutel" }, ips: { label: "Toegestane IP-adressen" } },
    events: {
      "api_key.created": "API-sleutel aangemaakt",
      "api_key.updated": "API-sleutel gewijzigd",
      "api_key.rescoped": "Toegang van API-sleutel gewijzigd",
      "api_key.rotated": "Nieuwe sleutel gemaakt",
      "api_key.grace_ended": "Oude sleutel gestopt",
      "api_key.revoked": "API-sleutel ingetrokken",
      "api_key.restored": "API-sleutel teruggezet"
    }
  },
  webhooks: {
    page: PAGE.webhooks,
    fields: {
      // The address only as changed: its path is often the hook's password (`endpointChanges`).
      url: { label: "Adres", happened: () => "gewijzigd" },
      description: { label: "Omschrijving", happened: textChanged },
      events: { label: "Gebeurtenissen", format: (v) => webhookEventLabel(String(v)) },
      apiVersion: { label: "API-versie" },
      stores: { label: "Winkels" },
      headers: { label: "Extra headers" },
      retry: { label: "Opnieuw proberen", values: { 0: "Geen", 3: "3 pogingen", 5: "5 pogingen", 8: "8 pogingen" } },
      active: { label: "Actief", values: ON_OFF }
    },
    events: {
      "webhook.created": "Webhook toegevoegd",
      "webhook.updated": "Webhook gewijzigd",
      "webhook.enabled": "Webhook aangezet",
      "webhook.paused": "Webhook gepauzeerd",
      "webhook.auto_disabled": "Webhook uitgezet na fouten",
      "webhook.removed": "Webhook verwijderd",
      "webhook.restored": "Webhook teruggezet",
      "webhook.purged": "Webhook definitief verwijderd",
      "webhook.secret_revealed": "Geheim bekeken",
      "webhook.secret_rotated": "Nieuw geheim gemaakt",
      "webhook.test_sent": "Test verstuurd",
      "webhook.redelivered": "Opnieuw verstuurd"
    }
  },
  // Je gegevens' automatic export (M17 step 5).
  data: {
    page: PAGE.data,
    whole: "Automatisch exporteren",
    fields: {
      data: { label: "Automatisch exporteren", values: { off: "Uit", weekly: "Elke week", monthly: "Elke maand" } }
    }
  },
  // Insyte-support's read-only look along (M18): the owner's consent, and each session's start, reads and end.
  support: { page: PAGE.privacy, whole: "Insyte-support mag meekijken" }
} as const satisfies Readonly<Record<string, SectionSpec>>

/** A section an audit row may name (`Audit.write`'s `section`): one with its page and its fields' words. */
export type SectionId = keyof typeof SECTIONS

/** A section as written; an unknown one is a page under its own name, which `audit-lines.test.ts` keeps from happening. */
const sectionSpec = (section: string): SectionSpec =>
  (SECTIONS as Readonly<Record<string, SectionSpec>>)[section] ?? { page: { id: section, label: section, path: "" } }

/** `settings.retention.*` and `retention.*` are Gegevens en privacy's; the older `workspace.retention_updated` Account's. */
const labelsOf = (section: string, action: string): SectionSpec =>
  section === "retention" && (action.startsWith("settings.retention.") || action.startsWith("retention."))
    ? { ...SECTIONS.retention, page: PAGE.privacy }
    : sectionSpec(section)

/** The field's spec in its section, or none: what a test asks of every field a writer logs. */
export const fieldSpec = (section: string, field: string): FieldSpec | undefined =>
  (sectionSpec(section).fields as Readonly<Record<string, FieldSpec>> | undefined)?.[field]

/** The event's words, or none. */
export const eventLabel = (section: string, action: string): string | undefined => sectionSpec(section).events?.[action]

/** The page a line belongs to. */
export const pageOf = (section: string, action: string): LogPage => labelsOf(section, action).page

/** Every page the Logboek knows, for the facets of the sections present. */
export const pagesOf = (sections: ReadonlyArray<{ readonly section: string; readonly action: string }>) => {
  const seen = new Map<string, LogPage>()
  for (const s of sections) {
    const page = pageOf(s.section, s.action)
    if (!seen.has(page.id)) seen.set(page.id, page)
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "nl"))
}

/** The sections a page's lines may have, for narrowing in SQL; the page is checked again per line. */
export const sectionsOfPage = (page: string): ReadonlyArray<string> => {
  if (page === PAGE.privacy.id) return ["retention", "support"]
  const known = Object.entries(SECTIONS as Readonly<Record<string, SectionSpec>>)
    .filter(([, labels]) => labels.page.id === page)
    .map(([section]) => section)
  return known.length > 0 ? known : [page]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type Change = { readonly field: string; readonly before: string | null; readonly after: string }

/** A field's line: its label (for its item), and what it was and became, or what happened to it. */
const lineOf = (
  labels: SectionSpec,
  field: string,
  before: unknown,
  after: unknown,
  item?: { readonly key?: unknown; readonly of?: unknown }
): Change => {
  const spec = (labels.fields as Readonly<Record<string, FieldSpec>> | undefined)?.[field]
  // The item by the name the change carries, else by the catalogue's; never by its key (a store's id says nothing).
  const named = typeof item?.of === "string" && item.of !== ""
    ? item.of
    : typeof item?.key === "string" || typeof item?.key === "number"
    ? spec?.items?.[String(item.key)]
    : undefined
  const label = spec === undefined
    ? labels.whole ?? labels.page.label
    : typeof spec.label === "function"
    ? spec.label(named ?? "")
    : spec.label
  if (spec?.happened !== undefined) return { field: label, before: null, after: spec.happened(before, after) }
  return { field: label, before: said(before, spec), after: said(after, spec) }
}

/** The fields in the order their page lists them (a `jsonb` diff keeps its own order), unknown ones after. */
const inPageOrder = (labels: SectionSpec, keys: ReadonlyArray<string>) => {
  const order = Object.keys(labels.fields ?? {})
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

/**
 * An audit row's changes as Logboek lines. The Logboek's own note first (`diff.log`, `Audit.LogNote`): an event with
 * its subject ("API-sleutel aangemaakt", "Boekhouding") and the fields it changed. Then the older shapes:
 * `{ field: { from, to } }` per field, `{ from, to }` of a whole value (or of an object, field by field), and
 * `settings.<section>.<field>` with `{ key?, of?, before, after }`. A row whose diff says nothing readable is one line
 * naming the change.
 */
export const changesOf = (
  row: { readonly section: string; readonly action: string; readonly diff: unknown }
): Array<Change> => {
  const labels = labelsOf(row.section, row.action)
  const diff = isRecord(row.diff) ? row.diff : {}
  const event = labels.events?.[row.action]
  const log = isRecord(diff["log"]) ? diff["log"] : undefined
  if (log !== undefined || event !== undefined) {
    const name = typeof log?.["name"] === "string" ? log["name"] : ""
    const changes = (Array.isArray(log?.["changes"]) ? log["changes"] : []).filter(isRecord).map((c) =>
      lineOf(labels, String(c["field"]), c["before"], c["after"], c)
    )
    // A change to one of many (a role, a member, a webhook) names it before each field.
    if (changes.length > 0) return name === "" ? changes : changes.map((c) => ({ ...c, field: `${name}: ${c.field}` }))
    if (event !== undefined) return [{ field: event, before: null, after: name }]
  }
  // What Insyte-support did while looking along, as one sentence (`support.session_started`, `.read`, `.session_ended`),
  // or its read of the status. Who did it is the line's Wie, so Wat names what it was.
  if (typeof diff["said"] === "string") {
    return [{
      field: row.action === "support.status_viewed" ? "Status" : "Meekijken",
      before: null,
      after: diff["said"]
    }]
  }
  const depthField = row.action.startsWith("settings.") ? row.action.split(".").slice(2).join(".") : ""
  if ("before" in diff || "after" in diff) {
    return [lineOf(labels, depthField || row.section, diff["before"], diff["after"], diff)]
  }
  if ("from" in diff || "to" in diff) {
    const from = diff["from"]
    const to = diff["to"]
    if (isRecord(from) || isRecord(to)) {
      const was = isRecord(from) ? from : {}
      const is = isRecord(to) ? to : {}
      return inPageOrder(labels, [...new Set([...Object.keys(was), ...Object.keys(is)])])
        .filter((key) => JSON.stringify(was[key]) !== JSON.stringify(is[key]))
        .map((key) => lineOf(labels, key, was[key], is[key]))
    }
    return [lineOf(labels, row.section, from, to)]
  }
  const fields = inPageOrder(labels, Object.keys(diff)).filter((key) => {
    const change = diff[key]
    return isRecord(change) && ("from" in change || "to" in change)
  })
  if (fields.length > 0) {
    return fields.map((key) => {
      const c = diff[key] as Record<string, unknown>
      return lineOf(labels, key, c["from"], c["to"])
    })
  }
  return [{ field: labels.whole ?? labels.page.label, before: null, after: "gewijzigd" }]
}

/** A CSV cell, quoted where it holds a separator, a quote or a line break. */
const cell = (value: string) => (/[",\n;]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value)

/** "Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd": the design's columns, as a CSV a spreadsheet opens as it is. */
export const toCsv = (lines: ReadonlyArray<AuditLine>, zone: string): string => {
  // "2026-11-12 13:57", in the workspace's zone: sorts as text, and a spreadsheet reads it as a time.
  const when = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
  const rows = [
    ["Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd"],
    ...lines.map((l) => [when.format(l.at), l.actor.name, l.page, l.field, l.before ?? "", l.after])
  ]
  return `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`
}
