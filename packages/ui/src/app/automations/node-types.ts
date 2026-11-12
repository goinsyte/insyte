import { type Step, type StepField, type StepKind, STEPS } from "@insyte/domain/automations/Steps"
import type { IconComponent } from "../../icons"
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Box,
  Calendar,
  ClipboardCheck,
  Clock,
  CreditCard,
  Filter,
  GitMerge,
  Hash,
  Inbox,
  Link2,
  Mail,
  MessageCircle,
  MessageSquare,
  Package,
  PiggyBank,
  Receipt,
  RefreshCcw,
  Route,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Split,
  Star,
  Tag,
  Ticket as TicketIcon,
  Truck,
  UserPlus,
  UserSearch,
  Webhook,
  Zap
} from "../../icons"

/**
 * Every step a flow can have. A step is one of four kinds; an action is Insyte's own, an AI step
 * (drawn dark, because it is the product proposing), or a step in a connected service, which carries
 * that service's logo. Each action names the right it needs (`scope`), which is what the flow's
 * service account is granted under Instellingen. The catalogue itself is the domain's
 * (`@insyte/domain/automations/Steps`), which the server validates against; this adds the glyphs.
 */
export type NodeKind = StepKind

export type NodeField = StepField

export type NodeVariant = Step & { icon: IconComponent }

const ICONS: Record<string, IconComponent> = {
  "trigger.order_placed": ShoppingBag,
  "trigger.order_shipped": Truck,
  "trigger.shipping_delay": Clock,
  "trigger.refund_requested": RefreshCcw,
  "trigger.customer_reply": MessageCircle,
  "trigger.email_received": Inbox,
  "trigger.review_received": Star,
  "trigger.chargeback": ShieldAlert,
  "trigger.inventory_low": Box,
  "trigger.schedule": Calendar,
  "trigger.webhook": Webhook,
  "action.send_email": Mail,
  "action.create_ticket": TicketIcon,
  "action.tag_customer": Tag,
  "action.notify_supplier": Send,
  "action.alert_team": AlertTriangle,
  "action.require_approval": ClipboardCheck,
  "action.refund": CreditCard,
  "action.assign_supplier": UserPlus,
  "action.update_tracking": Truck,
  "action.split_fulfillment": Split,
  "action.merge_orders": GitMerge,
  "action.verify_address": ShieldCheck,
  "action.detect_fraud": AlertTriangle,
  "action.sync_inventory": RefreshCcw,
  "action.check_eta": Clock,
  "action.track_event": BarChart3,
  "action.add_to_cohort": UserSearch,
  "action.run_workflow": Zap,
  "condition.branch": Split,
  "condition.filter": Filter,
  "condition.country": Route,
  "condition.tag_match": Hash,
  "delay.wait": Clock,
  "delay.wait_no_reply": Clock,
  "action.ai_compose": Sparkles,
  "action.ai_classify": Sparkles,
  "action.ai_summarize": Sparkles,
  "action.ai_link_orders": Link2,
  "action.ai_detect_intent": Sparkles,
  "action.ai_predict_ltv": PiggyBank,
  "action.shopify_update": ShoppingBag,
  "action.shopify_tag": Tag,
  "action.shopify_fulfil": Package,
  "action.klaviyo_send": Mail,
  "action.klaviyo_list": UserPlus,
  "action.klaviyo_pause": Clock,
  "action.gmail_send": Mail,
  "action.outlook_send": Mail,
  "action.slack_notify": MessageSquare,
  "action.slack_dm": Bell,
  "action.teams_notify": MessageSquare,
  "action.gorgias_create": TicketIcon,
  "action.stripe_refund": CreditCard,
  "action.stripe_lookup": Receipt,
  "action.klarna_refund": CreditCard,
  "action.klarna_dispute": ShieldCheck,
  "action.paypal_refund": CreditCard,
  "action.dhl_track": Truck,
  "action.dhl_return": Package,
  "action.postnl_track": Truck,
  "action.postnl_return": Package,
  "action.sendcloud_label": Package,
  "action.exact_invoice": Receipt,
  "action.exact_credit": Receipt,
  "action.m365_excel": BarChart3,
  "action.m365_calendar": Calendar,
  "action.sheets_row": BarChart3
}

export const NODE_VARIANTS: NodeVariant[] = STEPS.map((s) => ({ ...s, icon: ICONS[s.id] ?? Zap }))

export const VARIANTS_BY_ID: Record<string, NodeVariant> = Object.fromEntries(NODE_VARIANTS.map((v) => [v.id, v]))

export type PaletteGroup = { name: string; brand?: string; defaultOpen: boolean; variants: NodeVariant[] }

const GROUPS: ReadonlyArray<{ name: string; defaultOpen: boolean }> = [
  { name: "Triggers", defaultOpen: true },
  { name: "Insyte", defaultOpen: true },
  { name: "Logica", defaultOpen: false },
  { name: "AI", defaultOpen: false }
]

const BRAND_GROUPS = [...new Set(NODE_VARIANTS.filter((v) => v.brand && v.kind === "action").map((v) => v.category))]

export const PALETTE_GROUPS: PaletteGroup[] = [
  ...GROUPS.map((g) => ({ ...g, variants: NODE_VARIANTS.filter((v) => v.category === g.name) })),
  ...BRAND_GROUPS.map((name) => {
    const variants = NODE_VARIANTS.filter((v) => v.category === name)
    return { name, brand: variants[0]?.brand, defaultOpen: name === "Shopify" || name === "Klaviyo", variants }
  })
]

/** The word on a step's header strip. */
export function kindLabel(v: NodeVariant): string {
  if (v.kind === "trigger") return "Trigger · als"
  if (v.kind === "branch") return "Splitsing"
  if (v.kind === "condition") return "Voorwaarde"
  if (v.kind === "delay") return "Wachten"
  if (v.ai) return "AI-stap"
  if (v.brand) return v.category
  return "Insyte"
}

export type WorkflowNode = {
  id: string
  variantId: string
  config: Record<string, unknown>
  /** A Ja/nee-splitsing's two lanes. They merge back into the main line after it. */
  branches?: { yes: WorkflowNode[]; no: WorkflowNode[] }
}

export type VersionEntry = {
  v: number
  at: string
  by: string
  note: string
  nodes: WorkflowNode[]
}

export type WorkflowSettings = {
  /** Rights a step needs that were switched off; the step fails without them. */
  scopesOff: string[]
  /** Rights granted that no step needs. */
  scopesExtra: string[]
  /** Who hears when a run fails. */
  notify: string
  /** Runs per hour at most; 0 is no limit. */
  rateLimit: number
}

export type WorkflowState = {
  automationId: string
  name: string
  description: string
  status: "active" | "paused" | "draft"
  nodes: WorkflowNode[]
  savedAt: string
  createdAt: string
  owner: string
  /** The published version; 0 until the first publication. */
  version: number
  versions: VersionEntry[]
  settings: WorkflowSettings
  /** Every run so far, including the ones before this session. */
  runs: number
  /** The recent runs, newest first. */
  history: WorkflowRun[]
}

/** `running`, `stopped` and `skipped` are the console's: a run under way, one stopped, one a paused flow passed over. */
export type RunStatus = "succeeded" | "failed" | "waiting" | "duplicate" | "running" | "stopped" | "skipped"

export type RunStep = {
  nodeId: string
  variantId: string
  label: string
  /** `pending` is a step a waiting run has not reached yet; `stopped`, one a stopped run ended on. */
  status: "ok" | "error" | "skipped" | "waiting" | "pending" | "stopped"
  ms: number
  /** In a lane of a splitsing: which one. */
  lane?: "yes" | "no"
}

export type WorkflowRun = {
  id: string
  at: string
  status: RunStatus
  steps: number
  durationMs: number
  /** What started it, in the trigger's words. */
  cause?: string
  /** For a failed run: what went wrong, in plain words. */
  error?: string
  /** For a failed run: what fixes it. */
  fix?: string
  /** For a stopped or skipped run: why, in plain words. */
  reason?: string
  /** For a waiting run: a teammate's answer (and who), the customer's, or the clock. */
  waitingOn?: { kind: "approval" | "reply" | "wait"; approver?: string | undefined }
  /** Started by hand rather than by its trigger. */
  manual?: boolean
  /** The record that started it. */
  record?: {
    kind: "order" | "customer" | "ticket" | "chargeback" | "product"
    id: string
    number: string
    name: string
  }
  version?: number
  key?: string
  timeline?: RunStep[]
  input?: Record<string, string>
}

let _idSeq = 0
export function newNodeId() {
  _idSeq += 1
  return `n_${Date.now().toString(36)}_${_idSeq}`
}

/** Every node of a flow, the lanes of a splitsing included, in the order a run meets them. */
export function flatNodes(nodes: ReadonlyArray<WorkflowNode>): WorkflowNode[] {
  return nodes.flatMap((n) => (n.branches ? [n, ...n.branches.yes, ...n.branches.no] : [n]))
}
