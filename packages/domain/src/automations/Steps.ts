import { Schema } from "effect"

/*
 * Every step a flow can have (M12 step 1; widgets/05 §1.0, domain.md §11): 11 triggers, 18 Insyte actions, 6 logic
 * steps, 6 AI steps and 27 connector steps. The console bundles this catalogue and the server holds the same module, so
 * the builder, the validator at save and publish, and later the executor read one list. Labels and defaults are the
 * design's (`packages/ui/src/app/automations/node-types.ts`, which adds the glyphs). A step's config schema is drawn
 * from its fields (`configSchemaOf`): the inspector renders those fields, the validator decodes them.
 */

export type StepKind = "trigger" | "condition" | "delay" | "action" | "branch"

export type StepField =
  | {
    readonly key: string
    readonly label: string
    readonly type: "text" | "textarea" | "number"
    readonly placeholder?: string
    readonly required?: boolean
    /** For a number: the most it may be (a wait is capped at 30 days, ADR-0012). */
    readonly max?: number
  }
  | {
    readonly key: string
    readonly label: string
    readonly type: "select"
    readonly options: ReadonlyArray<{ readonly value: string; readonly label: string }>
  }
  | { readonly key: string; readonly label: string; readonly type: "switch" }

/** What a trigger's run is about: the record its `{{field}}` references read from. */
export type RecordKind = "order" | "chargeback" | "product" | "conversation" | "customers" | "payload"

export interface Step {
  readonly id: string
  readonly kind: StepKind
  readonly label: string
  readonly description: string
  /** The palette group. */
  readonly category: string
  /** A connected service: its logo stands in for the glyph, and the step needs that service connected. */
  readonly brand?: string
  /** An AI step. */
  readonly ai?: boolean
  /** The right the step needs, from `SCOPES`. */
  readonly scope?: string
  /** For a trigger: the record a run is about. */
  readonly record?: RecordKind
  /** Shown "Binnenkort": there is nothing to run it yet, so a flow with it cannot be published. */
  readonly soon?: boolean
  readonly defaultConfig: Readonly<Record<string, unknown>>
  readonly fields: ReadonlyArray<StepField>
}

const trig = (
  id: string,
  label: string,
  description: string,
  record: RecordKind,
  o: { readonly brand?: string; readonly soon?: boolean } = {}
): Step => ({
  id,
  kind: "trigger",
  label,
  description,
  category: "Triggers",
  record,
  ...(o.brand === undefined ? {} : { brand: o.brand }),
  ...(o.soon === true ? { soon: true } : {}),
  defaultConfig: {},
  fields: []
})

interface ActionOpts {
  readonly brand?: string
  readonly ai?: boolean
  readonly scope?: string
  readonly defaults?: Readonly<Record<string, unknown>>
  readonly fields?: ReadonlyArray<StepField>
}

const act = (id: string, label: string, description: string, category: string, o: ActionOpts = {}): Step => ({
  id,
  kind: "action",
  label,
  description,
  category,
  ...(o.brand === undefined ? {} : { brand: o.brand }),
  ...(o.ai === true ? { ai: true } : {}),
  ...(o.scope === undefined ? {} : { scope: o.scope }),
  defaultConfig: o.defaults ?? {},
  fields: o.fields ?? []
})

const MESSAGE: ReadonlyArray<StepField> = [
  { key: "to", label: "Aan", type: "text", placeholder: "{{customer.email}}", required: true },
  { key: "subject", label: "Onderwerp", type: "text" },
  { key: "body", label: "Bericht", type: "textarea" }
]

const CHANNEL: ReadonlyArray<StepField> = [
  { key: "channel", label: "Kanaal", type: "text", placeholder: "#cx", required: true },
  { key: "text", label: "Bericht", type: "textarea" }
]

/** A wait is capped at 30 days (ADR-0012). */
const MAX_MINUTES = 30 * 24 * 60
const MAX_HOURS = 30 * 24

export const STEPS: ReadonlyArray<Step> = [
  /* ── triggers ───────────────────────────────────────────────────────────────────────────── */
  trig("trigger.order_placed", "Nieuwe bestelling", "Bestelling aangemaakt in Shopify", "order", { brand: "shopify" }),
  trig("trigger.order_shipped", "Bestelling verzonden", "Bestelling als verzonden gemarkeerd", "order", {
    brand: "shopify"
  }),
  trig("trigger.shipping_delay", "Bestelling vertraagd", "Levering later dan verwacht", "order"),
  trig("trigger.refund_requested", "Terugbetaling aangevraagd", "Klant vraagt een terugbetaling", "order"),
  trig("trigger.customer_reply", "Antwoord van klant", "Antwoord in een open gesprek", "conversation"),
  trig("trigger.email_received", "E-mail ontvangen", "Inkomende e-mail komt overeen", "conversation"),
  // No review provider is connected anywhere yet (M12's decision): "Binnenkort" until one is.
  trig("trigger.review_received", "Nieuwe review", "Review geplaatst in de winkel", "conversation", { soon: true }),
  trig("trigger.chargeback", "Chargeback ontvangen", "Geschil geopend bij de bank", "chargeback"),
  trig("trigger.inventory_low", "Lage voorraad", "SKU onder de drempel", "product"),
  trig("trigger.schedule", "Op een vast moment", "Elke dag, week of maand", "customers"),
  trig("trigger.webhook", "Inkomende webhook", "Algemene webhook-ontvanger", "payload"),

  /* ── Insyte's own actions ───────────────────────────────────────────────────────────────── */
  act("action.send_email", "E-mail versturen", "Een klant of het team mailen", "Insyte", {
    scope: "customers.email",
    defaults: {
      to: "{{customer.email}}",
      subject: "We zijn ermee bezig",
      body: "Hoi {{customer.first_name}},\n\nWe zagen dat je bestelling…"
    },
    fields: MESSAGE
  }),
  act("action.create_ticket", "Ticket aanmaken", "Een intern ticket openen", "Insyte", {
    scope: "tickets.write",
    defaults: { queue: "intake", priority: "normal", title: "Opvolgen: {{order.number}}", assignee: "Maya Roy" },
    fields: [
      { key: "title", label: "Titel", type: "text", required: true },
      { key: "assignee", label: "Toewijzen aan", type: "text" },
      {
        key: "priority",
        label: "Prioriteit",
        type: "select",
        options: [
          { value: "low", label: "Laag" },
          { value: "normal", label: "Gemiddeld" },
          { value: "high", label: "Hoog" }
        ]
      },
      {
        key: "queue",
        label: "Wachtrij",
        type: "select",
        options: [
          { value: "intake", label: "Nieuw" },
          { value: "in_progress", label: "Bezig" },
          { value: "disputes", label: "Geschillen" }
        ]
      }
    ]
  }),
  act("action.tag_customer", "Klant labelen", "Een label aan de klant toevoegen", "Insyte", {
    scope: "customers.write",
    defaults: { tag: "follow-up" },
    fields: [{ key: "tag", label: "Label", type: "text", required: true }]
  }),
  act("action.notify_supplier", "Leverancier berichten", "Bericht in het leverancierskanaal", "Insyte", {
    scope: "suppliers.message",
    defaults: { supplier: "{{order.supplier}}", message: "Kun je de verzending bevestigen?" },
    fields: [
      { key: "supplier", label: "Leverancier", type: "text", required: true },
      { key: "message", label: "Bericht", type: "textarea" }
    ]
  }),
  act("action.alert_team", "Team waarschuwen", "Escaleren naar een team of persoon", "Insyte", {
    scope: "team.notify",
    defaults: { team: "Elena Hart", urgency: "high" },
    fields: [
      { key: "team", label: "Wie", type: "text", required: true },
      {
        key: "urgency",
        label: "Urgentie",
        type: "select",
        options: [
          { value: "low", label: "Laag" },
          { value: "medium", label: "Gemiddeld" },
          { value: "high", label: "Hoog" }
        ]
      }
    ]
  }),
  act(
    "action.require_approval",
    "Goedkeuring vragen",
    "Wachten tot een collega het voorstel goedkeurt",
    "Insyte",
    {
      defaults: { approver: "Elena Hart" },
      fields: [{ key: "approver", label: "Goedkeuring door", type: "text", required: true }]
    }
  ),
  act("action.refund", "Terugbetalen", "Gedeeltelijke of volledige terugbetaling", "Insyte", {
    scope: "refunds.write",
    defaults: { amount: "volledig", reason: "Coulance" },
    fields: [
      { key: "amount", label: "Bedrag", type: "text", placeholder: "volledig of 25,00", required: true },
      { key: "reason", label: "Reden", type: "text" }
    ]
  }),
  act("action.assign_supplier", "Leverancier toewijzen", "Bestelling doorzetten naar een leverancier", "Insyte", {
    scope: "orders.write",
    defaults: { supplier: "Yiwu Trading" },
    fields: [{ key: "supplier", label: "Leverancier", type: "text", required: true }]
  }),
  act("action.update_tracking", "Track & trace bijwerken", "Trackingnummer op de bestelling zetten", "Insyte", {
    scope: "orders.write"
  }),
  act("action.split_fulfillment", "Afhandeling splitsen", "Splitsen in meerdere zendingen", "Insyte", {
    scope: "orders.write"
  }),
  act("action.merge_orders", "Bestellingen samenvoegen", "Open bestellingen combineren", "Insyte", {
    scope: "orders.write"
  }),
  act("action.verify_address", "Adres controleren", "Het verzendadres nalopen", "Insyte", { scope: "orders.read" }),
  act("action.detect_fraud", "Fraude nagaan", "De frauderegels toepassen", "Insyte", { scope: "orders.read" }),
  act("action.sync_inventory", "Voorraad ophalen", "Actuele voorraad per SKU", "Insyte", { scope: "stock.read" }),
  act("action.check_eta", "Leverdatum herberekenen", "Verwachte leverdatum opnieuw bepalen", "Insyte", {
    scope: "orders.read"
  }),
  act("action.track_event", "Event vastleggen", "Vastleggen in analyse", "Insyte", {
    defaults: { event: "automation.fired" },
    fields: [{ key: "event", label: "Eventnaam", type: "text" }]
  }),
  act("action.add_to_cohort", "Aan groep toevoegen", "Klant groeperen voor analyse", "Insyte", {
    scope: "customers.write"
  }),
  act("action.run_workflow", "Andere flow starten", "Een andere automatisering uitvoeren", "Insyte", {
    defaults: { workflow_id: "" },
    fields: [{ key: "workflow_id", label: "Flow", type: "text" }]
  }),

  /* ── logic ──────────────────────────────────────────────────────────────────────────────── */
  {
    id: "condition.branch",
    kind: "branch",
    label: "Ja/nee-splitsing",
    description: "Twee wegen, afhankelijk van een voorwaarde",
    category: "Logica",
    defaultConfig: { expression: "{{order.total}} > 100" },
    fields: [{
      key: "expression",
      label: "Voorwaarde",
      type: "text",
      placeholder: "{{order.total}} > 100",
      required: true
    }]
  },
  {
    id: "condition.filter",
    kind: "condition",
    label: "Filter",
    description: "Alleen doorgaan als de voorwaarde klopt",
    category: "Logica",
    defaultConfig: { expression: "{{order.total}} > 100" },
    fields: [{
      key: "expression",
      label: "Voorwaarde",
      type: "text",
      placeholder: "{{order.total}} > 100",
      required: true
    }]
  },
  {
    id: "condition.country",
    kind: "condition",
    label: "Land is gelijk aan",
    description: "Vergelijken op verzendland",
    category: "Logica",
    defaultConfig: { country: "Duitsland" },
    fields: [{ key: "country", label: "Land", type: "text", placeholder: "Duitsland", required: true }]
  },
  {
    id: "condition.tag_match",
    kind: "condition",
    label: "Label komt overeen",
    description: "Labels van klant of bestelling vergelijken",
    category: "Logica",
    defaultConfig: { tag: "vip" },
    fields: [{ key: "tag", label: "Label", type: "text", placeholder: "vip", required: true }]
  },
  {
    id: "delay.wait",
    kind: "delay",
    label: "Wachten",
    description: "De flow een tijd pauzeren",
    category: "Logica",
    defaultConfig: { minutes: 30 },
    fields: [{ key: "minutes", label: "Minuten", type: "number", max: MAX_MINUTES }]
  },
  {
    id: "delay.wait_no_reply",
    kind: "delay",
    label: "Wachten op antwoord",
    description: "Pas verder als de klant niet antwoordt",
    category: "Logica",
    defaultConfig: { hours: 24 },
    fields: [{ key: "hours", label: "Uren", type: "number", max: MAX_HOURS }]
  },

  /* ── AI ─────────────────────────────────────────────────────────────────────────────────── */
  act("action.ai_compose", "Antwoord opstellen", "Een persoonlijk antwoord in de stem van het merk", "AI", {
    ai: true,
    scope: "ai.draft",
    defaults: { tone: "warm", instructions: "Bied excuses aan en geef 10% korting op de volgende bestelling." },
    fields: [
      {
        key: "tone",
        label: "Toon",
        type: "select",
        options: [
          { value: "warm", label: "Warm" },
          { value: "professional", label: "Zakelijk" },
          { value: "playful", label: "Speels" }
        ]
      },
      { key: "instructions", label: "Instructies", type: "textarea" }
    ]
  }),
  act("action.ai_classify", "Sentiment en onderwerp lezen", "Labelen of doorsturen op wat de klant schrijft", "AI", {
    ai: true,
    scope: "ai.draft"
  }),
  act("action.ai_summarize", "Samenvatten", "Gesprek of bestelling samenvatten", "AI", { ai: true, scope: "ai.draft" }),
  act("action.ai_link_orders", "Bestellingen koppelen", "Verwante bestellingen van de klant groeperen", "AI", {
    ai: true,
    scope: "orders.read"
  }),
  act("action.ai_detect_intent", "Bedoeling herkennen", "Wat de klant wil, in één woord", "AI", {
    ai: true,
    scope: "ai.draft"
  }),
  act("action.ai_predict_ltv", "Klantwaarde voorspellen", "Wat de klant over de looptijd waard is", "AI", {
    ai: true,
    scope: "customers.read"
  }),

  /* ── connected services ─────────────────────────────────────────────────────────────────── */
  act("action.shopify_update", "Bestelling bijwerken", "De bestelling in Shopify aanpassen", "Shopify", {
    brand: "shopify",
    scope: "orders.write"
  }),
  act("action.shopify_tag", "Label op bestelling", "Een label op de Shopify-bestelling zetten", "Shopify", {
    brand: "shopify",
    scope: "orders.write",
    defaults: { tag: "vertraagd" },
    fields: [{ key: "tag", label: "Label", type: "text", required: true }]
  }),
  act("action.shopify_fulfil", "Fulfilment aanmaken", "Een zending in Shopify aanmaken", "Shopify", {
    brand: "shopify",
    scope: "orders.write"
  }),
  act("action.klaviyo_send", "E-mail via Klaviyo", "Versturen met een Klaviyo-sjabloon", "Klaviyo", {
    brand: "klaviyo",
    scope: "customers.email",
    defaults: { to: "{{customer.email}}", template: "Excuses + nieuwe leverdatum" },
    fields: [
      { key: "to", label: "Aan", type: "text", required: true },
      { key: "template", label: "Sjabloon", type: "text" }
    ]
  }),
  act("action.klaviyo_list", "Aan lijst toevoegen", "Profiel op een Klaviyo-lijst zetten", "Klaviyo", {
    brand: "klaviyo",
    scope: "customers.write"
  }),
  act("action.klaviyo_pause", "Campagne pauzeren", "Een lopende Klaviyo-campagne stilzetten", "Klaviyo", {
    brand: "klaviyo",
    scope: "marketing.write"
  }),
  act("action.gmail_send", "Mail via Gmail", "Versturen vanuit de gekoppelde Gmail-mailbox", "Gmail", {
    brand: "gmail",
    scope: "customers.email",
    defaults: { to: "{{customer.email}}", subject: "Over je bestelling" },
    fields: MESSAGE
  }),
  act("action.outlook_send", "Mail via Outlook", "Versturen vanuit de gekoppelde Outlook-mailbox", "Outlook", {
    brand: "outlook",
    scope: "customers.email",
    defaults: { to: "{{customer.email}}", subject: "Over je bestelling" },
    fields: MESSAGE
  }),
  act("action.slack_notify", "Bericht in kanaal", "Een bericht in een Slack-kanaal plaatsen", "Slack", {
    brand: "slack",
    scope: "team.notify",
    defaults: { channel: "#cx", text: "Let op: {{trigger.summary}}" },
    fields: CHANNEL
  }),
  act("action.slack_dm", "Privébericht", "Een collega rechtstreeks berichten", "Slack", {
    brand: "slack",
    scope: "team.notify",
    defaults: { channel: "@elena", text: "{{trigger.summary}}" },
    fields: CHANNEL
  }),
  act("action.teams_notify", "Bericht in Teams", "Een bericht in een Teams-kanaal plaatsen", "Microsoft Teams", {
    brand: "microsoft-teams",
    scope: "team.notify",
    defaults: { channel: "Klantenservice", text: "{{trigger.summary}}" },
    fields: CHANNEL
  }),
  act("action.gorgias_create", "Ticket in Gorgias", "Het ticket doorzetten naar Gorgias", "Gorgias", {
    brand: "gorgias",
    scope: "tickets.write"
  }),
  act("action.stripe_refund", "Terugbetalen via Stripe", "De betaling in Stripe terugboeken", "Stripe", {
    brand: "stripe",
    scope: "refunds.write"
  }),
  act("action.stripe_lookup", "Betaling opzoeken", "De Stripe-betaling bij de bestelling ophalen", "Stripe", {
    brand: "stripe",
    scope: "payments.read"
  }),
  act("action.klarna_refund", "Terugbetalen via Klarna", "De Klarna-betaling terugboeken", "Klarna", {
    brand: "klarna",
    scope: "refunds.write"
  }),
  act("action.klarna_dispute", "Geschil beantwoorden", "Het bewijs naar Klarna sturen", "Klarna", {
    brand: "klarna",
    scope: "disputes.write"
  }),
  act("action.paypal_refund", "Terugbetalen via PayPal", "De PayPal-betaling terugboeken", "PayPal", {
    brand: "paypal",
    scope: "refunds.write"
  }),
  act("action.dhl_track", "Zending volgen", "De status bij DHL ophalen", "DHL", { brand: "dhl", scope: "orders.read" }),
  act("action.dhl_return", "Retourlabel maken", "Een DHL-retourlabel voor de klant", "DHL", {
    brand: "dhl",
    scope: "orders.write"
  }),
  act("action.postnl_track", "Zending volgen", "De status bij PostNL ophalen", "PostNL", {
    brand: "postnl",
    scope: "orders.read"
  }),
  act("action.postnl_return", "Retourlabel maken", "Een PostNL-retourlabel voor de klant", "PostNL", {
    brand: "postnl",
    scope: "orders.write"
  }),
  act("action.sendcloud_label", "Verzendlabel maken", "Label en track & trace via Sendcloud", "Sendcloud", {
    brand: "sendcloud",
    scope: "orders.write"
  }),
  act("action.exact_invoice", "Verkoopfactuur boeken", "De bestelling als factuur in Exact Online", "Exact Online", {
    brand: "exact",
    scope: "accounting.write"
  }),
  act(
    "action.exact_credit",
    "Creditnota boeken",
    "De terugbetaling als creditnota in Exact Online",
    "Exact Online",
    { brand: "exact", scope: "accounting.write" }
  ),
  act("action.m365_excel", "Rij in Excel", "Een regel toevoegen aan een Excel-werkmap", "Microsoft 365", {
    brand: "microsoft",
    scope: "files.write"
  }),
  act("action.m365_calendar", "Agenda-item", "Een afspraak in Outlook-agenda zetten", "Microsoft 365", {
    brand: "microsoft",
    scope: "files.write"
  }),
  act("action.sheets_row", "Rij toevoegen", "Een regel toevoegen aan een Google-spreadsheet", "Google Sheets", {
    brand: "google-sheets",
    scope: "files.write"
  })
]

export const STEPS_BY_ID: Readonly<Record<string, Step>> = Object.fromEntries(STEPS.map((s) => [s.id, s]))

/** The name a connected service goes by on the canvas ("Koppel Klaviyo"): its palette group. */
export const BRAND_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  STEPS.filter((s) => s.brand !== undefined && s.kind === "action").map((s) => [s.brand!, s.category])
)

/** A field's schema: what a value must be for the step to run. Text may hold `{{field}}` references. */
export const fieldSchemaOf = (field: StepField): Schema.Top => {
  switch (field.type) {
    case "text":
    case "textarea":
      return Schema.String.check(Schema.isMaxLength(field.type === "text" ? 500 : 5000))
    case "number":
      return Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(field.max ?? 1e9))
    case "select":
      return Schema.Literals(field.options.map((o) => o.value) as [string, ...Array<string>])
    case "switch":
      return Schema.Boolean
  }
}

/**
 * A step's config schema (M12's decision): each field optional, of its type, with the canvas's free text beside it
 * (`summary` for a trigger's "Wanneer", `title_override` for "Titel op het canvas"). Whether a required field is set is
 * the validator's question, not the schema's, so a draft half filled in still saves.
 */
export const configSchemaOf = (step: Step) =>
  Schema.Struct({
    summary: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
    title_override: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
    ...Object.fromEntries(step.fields.map((f) => [f.key, Schema.optional(fieldSchemaOf(f))]))
  })
