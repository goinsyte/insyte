import type { Flow } from "./Graph.ts"
import { STEPS_BY_ID } from "./Steps.ts"

/*
 * The automation library (widgets/05 §1.2): the first five are the example flows the original product spec names, the
 * rest cover the triggers it lists. A template is only steps: using it makes a draft, and nothing runs until the
 * operator turns it on. One list for the console's library, `Automations.create({ templateId })` and
 * `Automations.recommended`; the design app adds its fixtures' evidence to it.
 */

export interface TemplateStep {
  readonly variantId: string
  readonly summary: string
}

export type TemplateCategory = "Orders" | "Customers" | "Support" | "Stock" | "Disputes"

export interface Template {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: TemplateCategory
  readonly steps: ReadonlyArray<TemplateStep>
}

export const TEMPLATES: ReadonlyArray<Template> = [
  {
    id: "tpl_shipped",
    name: "Bestelling verzonden → track & trace-bericht",
    description:
      "Als een bestelling wordt verzonden, stuur de klant de track & trace-link, een merkfoto en de retourinstructies.",
    category: "Orders",
    steps: [
      { variantId: "trigger.order_shipped", summary: "Bestelling in Shopify als verzonden gemarkeerd" },
      { variantId: "action.klaviyo_send", summary: "Track & trace-link · merkfoto · retourstappen" }
    ]
  },
  {
    id: "tpl_late",
    name: "Late levering → leverancier, excuses en korting",
    description:
      "Als een levering te laat is, vraag de leverancier de verzending te bevestigen, bied de klant excuses aan en geef 10% korting.",
    category: "Orders",
    steps: [
      { variantId: "trigger.shipping_delay", summary: "Levering later dan verwacht" },
      { variantId: "action.notify_supplier", summary: "Leverancier vragen de verzending te bevestigen" },
      { variantId: "action.ai_compose", summary: "Excuses in de stem van het merk" },
      { variantId: "action.send_email", summary: "Excuses + kortingscode van 10%" }
    ]
  },
  {
    id: "tpl_vip",
    name: "Bestelling met hoge waarde → VIP-label en melding aan eigenaar",
    description:
      "Als een klant die veel heeft uitgegeven opnieuw bestelt, label hem als VIP en laat het de eigenaar persoonlijk weten.",
    category: "Customers",
    steps: [
      { variantId: "trigger.order_placed", summary: "Bestelling van een klant met een totale waarde boven €1.000" },
      { variantId: "action.tag_customer", summary: "Label VIP" },
      { variantId: "action.alert_team", summary: "Eigenaar laten weten" }
    ]
  },
  {
    id: "tpl_negative",
    name: "Negatief ticket → escaleren met een voorgesteld antwoord",
    description:
      "Als een klant ontevreden klinkt, escaleer het ticket naar de CX-lead met een antwoord dat Insyte heeft opgesteld.",
    category: "Support",
    steps: [
      { variantId: "trigger.customer_reply", summary: "Klant klinkt negatief" },
      { variantId: "action.ai_classify", summary: "Het sentiment lezen" },
      { variantId: "action.create_ticket", summary: "Escaleren naar de CX-lead · prioriteit hoog" },
      { variantId: "action.ai_compose", summary: "Voorgesteld antwoord op het ticket" }
    ]
  },
  {
    id: "tpl_stock",
    name: "Lage voorraad → operations inlichten, campagne pauzeren",
    description:
      "Als een product bijna op is, laat het operations weten en pauzeer de Klaviyo-campagnes die het verkopen.",
    category: "Stock",
    steps: [
      { variantId: "trigger.inventory_low", summary: "Minder dan 60 stuks over" },
      { variantId: "action.alert_team", summary: "Operations inlichten" },
      { variantId: "action.klaviyo_send", summary: "Campagnes voor dit product pauzeren" }
    ]
  },
  {
    id: "tpl_chargeback",
    name: "Chargeback geopend → bewijs en een ticket",
    description:
      "Als er een geschil wordt geopend, koppel de bestellingen van de klant, begin aan het bewijspakket en open een ticket met de deadline.",
    category: "Disputes",
    steps: [
      { variantId: "trigger.chargeback", summary: "Geschil geopend bij de bank" },
      { variantId: "action.ai_link_orders", summary: "Bestellingen van de klant koppelen" },
      { variantId: "action.create_ticket", summary: "Ticket met de antwoorddeadline" }
    ]
  },
  {
    id: "tpl_refund",
    name: "Terugbetaling aangevraagd → eerst goedkeuring",
    description:
      "Als een klant om een terugbetaling boven €100 vraagt, houd die vast tot er goedkeuring is, voordat er iets wordt terugbetaald.",
    category: "Orders",
    steps: [
      { variantId: "trigger.refund_requested", summary: "Terugbetaling boven €100 aangevraagd" },
      { variantId: "action.require_approval", summary: "Eigenaar keurt goed" },
      { variantId: "action.stripe_refund", summary: "Terugbetalen via Stripe" }
    ]
  },
  {
    id: "tpl_review",
    name: "Slechte review → ticket en een persoonlijk antwoord",
    description:
      "Als er een review van een of twee sterren binnenkomt, open een ticket en stel een persoonlijk antwoord aan de reviewer op.",
    category: "Support",
    steps: [
      { variantId: "trigger.review_received", summary: "Review van 1 of 2 sterren" },
      { variantId: "action.create_ticket", summary: "Ticket voor CX" },
      { variantId: "action.ai_compose", summary: "Persoonlijk antwoord aan de reviewer" }
    ]
  },
  {
    id: "tpl_winback",
    name: "90 dagen geen bestelling → terugwinnen",
    description: "Als een klant 90 dagen niet heeft besteld, zet hem op de terugwinlijst in Klaviyo.",
    category: "Customers",
    steps: [
      { variantId: "trigger.schedule", summary: "Elke dag: klanten die 90 dagen niet bestelden" },
      { variantId: "action.klaviyo_list", summary: "Klaviyo-terugwinlijst" }
    ]
  },
  {
    id: "tpl_followup",
    name: "Antwoord van klant → samenvatting op het ticket",
    description:
      "Als een klant antwoordt in een open gesprek, vat het gesprek samen op het ticket, zodat wie het oppakt meteen weet waar het over gaat.",
    category: "Support",
    steps: [
      { variantId: "trigger.customer_reply", summary: "Antwoord in een open gesprek" },
      { variantId: "action.ai_summarize", summary: "Samenvatting op het ticket" }
    ]
  }
]

export const TEMPLATES_BY_ID: Readonly<Record<string, Template>> = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]))

/** A template's steps as a draft's, each with its step's defaults and the template's line as its "Wanneer". */
export const nodesOfTemplate = (template: Template, newId: () => string): Flow =>
  template.steps.map((s) => ({
    id: newId(),
    variantId: s.variantId,
    config: { ...STEPS_BY_ID[s.variantId]?.defaultConfig, summary: s.summary }
  }))
