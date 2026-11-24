import type { Glyph } from "../fixtures/agents.ts"
import { paths } from "../router.tsx"
import {
  CreditCard,
  Mail,
  MessagesSquare,
  Package,
  Returns,
  ShoppingBag,
  Ticket,
  User,
  Workflow
} from "../ui/icons.tsx"
import { AREA_LABEL, level, rolLabel } from "../view.ts"
import type { PermArea, View } from "../view.ts"

/**
 * Everything the console can make, in the order an operator reaches for it: the main bar's Nieuw and
 * the palette's actions read this one list. Each goes to the page that makes it with `?nieuw=1`, and
 * that page opens its own dialog, so every dialog stays with the page it belongs to. A kind the role
 * may not make, or one that starts from another record, stays listed and says why.
 */

type CreateKind =
  | "order"
  | "return"
  | "ticket"
  | "customer"
  | "product"
  | "evidence"
  | "automation"
  | "email"
  | "channel"

type CreateItem = {
  readonly kind: CreateKind
  /** In the Nieuw menu: "Bestelling". */
  readonly label: string
  /** In the palette: "Nieuwe bestelling". */
  readonly newLabel: string
  readonly glyph: Glyph
  readonly area: PermArea
  /** What the role needs to see named when it may not: "bestellingen". */
  readonly noun: string
  readonly href: string
  /** Set when it does not start from nothing: where it starts instead. */
  readonly startsFrom?: string
  /** A letter for the Nieuw menu. */
  readonly key?: string
}

export const CREATE_ITEMS: ReadonlyArray<CreateItem> = [
  {
    kind: "order",
    label: "Conceptbestelling",
    newLabel: "Nieuwe conceptbestelling",
    glyph: ShoppingBag,
    area: "orders",
    noun: "bestellingen",
    href: `${paths.orders}?nieuw=1`,
    key: "B"
  },
  {
    kind: "return",
    label: "Retour",
    newLabel: "Retour starten",
    glyph: Returns,
    area: "returns",
    noun: "retouren",
    href: paths.returns,
    startsFrom: "Start je vanuit de bestelling"
  },
  {
    kind: "ticket",
    label: "Ticket",
    newLabel: "Nieuw ticket",
    glyph: Ticket,
    area: "support",
    noun: "tickets",
    href: `${paths.tickets}?nieuw=1`,
    key: "T"
  },
  {
    kind: "customer",
    label: "Klant",
    newLabel: "Nieuwe klant",
    glyph: User,
    area: "customers",
    noun: "klanten",
    href: `${paths.customers}?nieuw=1`
  },
  {
    kind: "product",
    label: "Product",
    newLabel: "Nieuw product",
    glyph: Package,
    area: "products",
    noun: "producten",
    href: `${paths.products}?nieuw=1`
  },
  {
    kind: "evidence",
    label: "Bewijspakket",
    newLabel: "Nieuw bewijspakket",
    glyph: CreditCard,
    area: "chargebacks",
    noun: "bewijspakketten",
    href: paths.chargebacks,
    startsFrom: "Start je vanuit de chargeback"
  },
  {
    kind: "automation",
    label: "Automatisering",
    newLabel: "Nieuwe automatisering",
    glyph: Workflow,
    area: "automations",
    noun: "automatiseringen",
    href: `${paths.automations}?nieuw=1`
  },
  {
    kind: "email",
    label: "E-mail",
    newLabel: "Nieuwe e-mail",
    glyph: Mail,
    area: "support",
    noun: "e-mails",
    href: paths.inbox,
    startsFrom: "Beantwoord je vanuit een gesprek in de inbox"
  },
  {
    kind: "channel",
    label: "Chatkanaal",
    newLabel: "Nieuw chatkanaal",
    glyph: MessagesSquare,
    area: "support",
    noun: "chatkanalen",
    href: paths.teamChat,
    startsFrom: "Maakt een beheerder onder Teamchat"
  }
]

/** Why this role cannot start one here, or `null` when it can. */
export function createBlocked(view: View, item: CreateItem): string | null {
  if (level(view, item.area) < 2) {
    return `${rolLabel(view.rol)} maakt geen ${item.noun}: ${AREA_LABEL[item.area]} is ${
      level(view, item.area) === 0 ? "dicht" : "alleen lezen"
    }`
  }
  return item.startsFrom ?? null
}
