import { cn } from "../lib/utils"
import { VARIANTS_BY_ID, type WorkflowNode } from "./node-types"

/**
 * A step in one line, read off its settings, with the record's fields as chips: "Aan klant.email ·
 * “Excuses + nieuwe leverdatum”". A field is written `{{customer.email}}` in a step's settings and
 * read back in Dutch, in the sans face, as a soft `arc-tint` chip; it is never set in a typewriter.
 */
const VAR_LABEL: Record<string, string> = {
  "customer.email": "klant.email",
  "customer.first_name": "klant.voornaam",
  "customer.name": "klant.naam",
  "order.number": "bestelling.nummer",
  "order.total": "bestelling.totaal",
  "order.supplier": "bestelling.leverancier",
  "order.tracking": "bestelling.trackingnummer",
  "order.expected_delivery": "bestelling.verwachte_bezorging",
  "trigger.summary": "trigger"
}

export const varLabel = (key: string) => VAR_LABEL[key.trim()] ?? key.trim()

const PRIORITY: Record<string, string> = {
  low: "laag",
  normal: "gemiddeld",
  medium: "gemiddeld",
  high: "hoog",
  urgent: "urgent"
}
const TONE: Record<string, string> = { warm: "warm", professional: "zakelijk", playful: "speels" }

const s = (x: unknown) => (typeof x === "string" ? x.trim() : "")
const q = (x: unknown) => (s(x) ? ` · “${s(x)}”` : "")

function minutes(n: number) {
  if (n >= 1440 && n % 1440 === 0) return `${n / 1440} ${n === 1440 ? "dag" : "dagen"}`
  if (n >= 60 && n % 60 === 0) return `${n / 60} u`
  return `${n} min`
}

export function summaryOf(node: WorkflowNode): string {
  const v = VARIANTS_BY_ID[node.variantId]
  const c = node.config
  if (!v) return ""
  if (v.kind === "trigger") return s(c.summary) || v.description
  switch (v.id) {
    case "action.send_email":
    case "action.gmail_send":
    case "action.outlook_send":
      return `Aan ${s(c.to) || "…"}${q(c.subject)}`
    case "action.klaviyo_send":
      return `Aan ${s(c.to) || "…"}${s(c.template) ? ` · sjabloon “${s(c.template)}”` : ""}`
    case "action.create_ticket":
      return [
        `“${s(c.title) || "Nieuw ticket"}”`,
        s(c.assignee),
        c.priority ? `prioriteit ${PRIORITY[String(c.priority)] ?? c.priority}` : ""
      ]
        .filter(Boolean)
        .join(" · ")
    case "action.tag_customer":
    case "action.shopify_tag":
    case "condition.tag_match":
      return `${v.kind === "condition" ? "als label = " : "Label "}“${s(c.tag) || "…"}”`
    case "action.notify_supplier":
      return `${s(c.supplier) || "…"}${q(c.message)}`
    case "action.alert_team":
      return `${s(c.team) || "…"} · urgentie ${PRIORITY[String(c.urgency)] ?? "hoog"}`
    case "action.slack_notify":
    case "action.slack_dm":
    case "action.teams_notify":
      return `${s(c.channel) || "…"}${q(c.text)}`
    case "action.refund":
      return `${s(c.amount) || "…"}${s(c.reason) ? ` · ${s(c.reason)}` : ""}`
    case "action.require_approval":
      return `Door ${s(c.approver) || "…"}`
    case "action.assign_supplier":
      return s(c.supplier) || "Kies een leverancier"
    case "action.ai_compose":
      return `Toon ${TONE[String(c.tone)] ?? "warm"}${s(c.instructions) ? ` · ${s(c.instructions)}` : ""}`
    case "condition.branch":
    case "condition.filter":
      return `als ${s(c.expression) || "…"}`
    case "condition.country":
      return `als land = ${s(c.country) || "…"}`
    case "delay.wait":
      return `${minutes(Number(c.minutes) || 0)} wachten`
    case "delay.wait_no_reply":
      return `${Number(c.hours) || 0} u zonder antwoord`
    default:
      return s(c.summary) || v.description
  }
}

export function titleOf(node: WorkflowNode): string {
  return s(node.config.title_override) || VARIANTS_BY_ID[node.variantId]?.label || "Stap"
}

/** A field as a chip, in the sans face. */
export function VarChip({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded-sm bg-arc-tint px-1 font-medium text-arc-ink text-xs leading-none",
        className
      )}
    >
      {varLabel(name)}
    </span>
  )
}

/** Text with `{{field}}` read back as chips. */
export function VarText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/\{\{([^}]+)\}\}/g)
  return (
    <span className={className}>
      {parts.map((p, i) =>
        i % 2 === 1 ?
          (
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
            <VarChip key={i} name={p} className="mx-px align-[1px]" />
          ) :
          (
            // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed string
            <span key={i}>{p}</span>
          )
      )}
    </span>
  )
}
