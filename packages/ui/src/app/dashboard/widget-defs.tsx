import {
  AtSign,
  BarChart3,
  Box,
  Calendar,
  Check,
  Clock,
  CornerDownLeft,
  Globe,
  type IconComponent,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Pin,
  Rocket,
  RotateCcw,
  ShoppingBag,
  Sparkle,
  Star,
  Ticket,
  Truck,
  Users,
  Workflow
} from "../../icons"
import type { WidgetId, WidgetSize, WidgetTone } from "../stores/home-store"

/*
 * What the board knows of each card before drawing it: its name, its line in "Kaart toevoegen", its glyph, its size
 * and ground, and where "Openen" goes. Apart from the cards themselves (`widgets.tsx`), so a host that draws its own
 * bodies (the console) reads the board without the demo's stores.
 */

export type WidgetMeta = {
  id: WidgetId
  title: string
  /** One line for the add-widget menu. */
  blurb: string
  icon: IconComponent
  defaultSize: WidgetSize
  defaultTone: WidgetTone
  /** The grounds the operator may put it on. The queue keeps the brand's glow. */
  tones: ReadonlyArray<WidgetTone>
  /** Where "Open" in the heading goes, when the widget is a window onto a screen. */
  to?: string
}

const LIGHT: ReadonlyArray<WidgetTone> = ["paper", "tint", "mist"]

export const WIDGET_DEFS: Record<WidgetId, WidgetMeta> = {
  queue: {
    id: "queue",
    title: "Je wachtrij",
    blurb: "Wat een beslissing van je vraagt, op volgorde van resterende tijd.",
    icon: Inbox,
    defaultSize: 2,
    defaultTone: "mesh",
    tones: ["mesh"]
  },
  setup: {
    id: "setup",
    title: "Inrichting afronden",
    blurb: "Wat de onboarding voor later liet, afgevinkt zodra je het doet.",
    icon: Rocket,
    defaultSize: 1,
    defaultTone: "tint",
    tones: LIGHT
  },
  todo: {
    id: "todo",
    title: "Je lijst",
    blurb: "Een korte takenlijst die alleen jij ziet.",
    icon: Check,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT
  },
  revenue: {
    id: "revenue",
    title: "Omzet",
    blurb: "Bestelwaarde per week, vergeleken met de weken ervoor.",
    icon: BarChart3,
    defaultSize: 2,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/analytics"
  },
  orders: {
    id: "orders",
    title: "Bestellingen per fase",
    blurb: "Waar elke open bestelling staat, en hoeveel er vertraagd zijn.",
    icon: ShoppingBag,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/orders"
  },
  chargebacks: {
    id: "chargebacks",
    title: "Chargebacks",
    blurb: "Zaken die op bewijs wachten, en je resultaten tot nu toe.",
    icon: CornerDownLeft,
    defaultSize: 1,
    defaultTone: "tint",
    tones: LIGHT,
    to: "/chargebacks"
  },
  suppliers: {
    id: "suppliers",
    title: "Vertragingen bij leveranciers",
    blurb: "Welke leveranciers bestellingen ophouden.",
    icon: Truck,
    defaultSize: 1,
    defaultTone: "mist",
    tones: LIGHT,
    to: "/orders"
  },
  tickets: {
    id: "tickets",
    title: "Tickets",
    blurb: "De kolommen van het bord in één oogopslag.",
    icon: Ticket,
    defaultSize: 1,
    defaultTone: "tint",
    tones: LIGHT,
    to: "/tickets"
  },
  stock: {
    id: "stock",
    title: "Lage voorraad",
    blurb: "Varianten die bijna op zijn.",
    icon: Box,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/products"
  },
  automations: {
    id: "automations",
    title: "Automatiseringen",
    blurb: "Wat er de afgelopen 30 dagen is uitgevoerd.",
    icon: Workflow,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/automations"
  },
  mytickets: {
    id: "mytickets",
    title: "Mijn tickets",
    blurb: "De open tickets die aan jou zijn toegewezen, de meest urgente eerst.",
    icon: Ticket,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/tickets"
  },
  team: {
    id: "team",
    title: "Team nu",
    blurb: "Wie er is en waar ze aan werken, één klik van een bericht.",
    icon: Users,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/settings/team"
  },
  today: {
    id: "today",
    title: "Agenda vandaag",
    blurb: "De deadlines en geplande dingen van vandaag, met een lijn voor nu.",
    icon: Calendar,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT
  },
  live: {
    id: "live",
    title: "Live bestellingen",
    blurb: "Bestellingen zoals ze binnenkomen, te pauzeren.",
    icon: ShoppingBag,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/orders"
  },
  mentions: {
    id: "mentions",
    title: "Vermeldingen en toegewezen",
    blurb: "Waar iemand je noemde of werk bij je neerlegde.",
    icon: AtSign,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/notifications"
  },
  recent: {
    id: "recent",
    title: "Recent",
    blurb: "De records die je het laatst opende.",
    icon: Clock,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT
  },
  insyte: {
    id: "insyte",
    title: "Wat Insyte deed",
    blurb: "Concepten, voorstellen en uitvoeringen van vandaag, en de tijd die het scheelt.",
    icon: Sparkle,
    defaultSize: 1,
    defaultTone: "tint",
    tones: LIGHT
  },
  customeragent: {
    id: "customeragent",
    title: "Klantagent vandaag",
    blurb: "Gesprekken op de websitechat: wat Insyte afhandelde en wat het doorgaf.",
    icon: MessageCircle,
    defaultSize: 1,
    defaultTone: "tint",
    tones: LIGHT,
    to: "/settings/ai/customer-agent"
  },
  returns: {
    id: "returns",
    title: "Retouren",
    blurb: "Wat te beoordelen of af te handelen is, met de deadline.",
    icon: RotateCcw,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/returns"
  },
  bestsellers: {
    id: "bestsellers",
    title: "Bestsellers",
    blurb: "Wat het meest verkocht, met de voorraad die nog over is.",
    icon: Star,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/products"
  },
  bookmarks: {
    id: "bookmarks",
    title: "Bladwijzers",
    blurb: "Je vastgezette records en favorieten, één klik van de start.",
    icon: Pin,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT
  },
  countries: {
    id: "countries",
    title: "Bestellingen per land",
    blurb: "Waar je bestellingen vandaan komen, in de periode van het bord.",
    icon: Globe,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/analytics"
  },
  chats: {
    id: "chats",
    title: "Ongelezen chats",
    blurb: "Kanalen en privéberichten met iets nieuws.",
    icon: MessagesSquare,
    defaultSize: 1,
    defaultTone: "paper",
    tones: LIGHT,
    to: "/chats"
  }
}
