import type { Glyph } from "../../fixtures/agents.ts"
import type { MomentKind, Tone } from "../../fixtures/home.ts"
import {
  BarChart3,
  Bell,
  Check,
  CreditCard,
  Inbox,
  Phone,
  Returns,
  Ticket,
  Truck,
  UserPlus,
  Wallet,
  Workflow
} from "../../ui/icons.tsx"

/** The glyph of each kind of dated thing on Start: Mijn werk's rows and the Agenda's blocks. */
export const KIND_GLYPH: Readonly<Record<MomentKind, Glyph>> = {
  wachtrij: Inbox,
  ticket: Ticket,
  leverancier: Truck,
  chargeback: CreditCard,
  retour: Returns,
  uitnodiging: UserPlus,
  taak: Check,
  automatisering: Workflow,
  overzicht: Bell,
  afspraak: Phone,
  rapport: BarChart3,
  uitbetaling: Wallet
}

/** A block's ground and ink by its tone: tints, so the day reads by colour without boxes in boxes. */
export const BLOCK: Readonly<Record<Tone, string>> = {
  bad: "bg-bad-tint text-bad-ink",
  warn: "bg-warn-tint text-warn-ink",
  accent: "bg-accent-tint text-accent-ink",
  good: "bg-good-tint text-good-ink",
  neutral: "bg-well text-ink-2"
}
