import type { AreaDef } from "../../areas.ts"
import {
  allureStatements,
  AURORA_SIZES,
  COURSES,
  ME,
  SUP_PRODUCTS,
  supplierCounts,
  supplierRows
} from "../../fixtures/supplier-portal.ts"
import type { AreaRoute } from "../../router.tsx"
import { paths } from "../../router.tsx"
import type { Thread } from "../../shell/threads.ts"
import { Bell, GraduationCap, Home, MessagesSquare, Package, Settings, ShoppingBag, Wallet } from "../../ui/icons.tsx"
import { SupplierDashboard } from "./dashboard.tsx"
import { OrderPage, OrdersPage } from "./orders.tsx"
import {
  ChatPage,
  CoursePage,
  NotificationsPage,
  SettingsPage,
  StatementPage,
  StatementsPage,
  TrainingPage
} from "./pages.tsx"
import type { SupplierSettingsTab } from "./pages.tsx"
import { ProductPage, ProductsPage } from "./products.tsx"

const counts = supplierCounts()

const NAV = [
  { id: "overzicht", label: "Overzicht", href: paths.supplierPortal(), glyph: Home },
  {
    id: "bestellingen",
    label: "Bestellingen",
    href: paths.supplierPortal("bestellingen"),
    glyph: ShoppingBag,
    alert: counts.accept
  },
  { id: "producten", label: "Producten", href: paths.supplierPortal("producten"), glyph: Package },
  { id: "chats", label: "Chats", href: paths.supplierPortal("chats"), glyph: MessagesSquare, alert: counts.unreadChat },
  { id: "afrekeningen", label: "Afrekeningen", href: paths.supplierPortal("afrekeningen"), glyph: Wallet },
  { id: "training", label: "Training", href: paths.supplierPortal("training"), glyph: GraduationCap },
  {
    id: "meldingen",
    label: "Meldingen",
    href: paths.supplierPortal("meldingen"),
    glyph: Bell,
    alert: counts.unreadNotes
  },
  { id: "instellingen", label: "Instellingen", href: paths.supplierPortal("instellingen"), glyph: Settings }
]

const TABS: ReadonlyArray<SupplierSettingsTab> = ["profiel", "meldingen", "api-koppeling"]

function Screen({ route }: { readonly route: AreaRoute }) {
  const [page, id] = route.path
  if (page === undefined) return <SupplierDashboard />
  if (page === "bestellingen") return id === undefined ? <OrdersPage /> : <OrderPage number={id.replace(/^#/, "")} />
  if (page === "producten") return id === undefined ? <ProductsPage /> : <ProductPage id={id} />
  if (page === "chats") return <ChatPage />
  if (page === "afrekeningen") return id === undefined ? <StatementsPage /> : <StatementPage id={id} />
  if (page === "training") return id === undefined ? <TrainingPage /> : <CoursePage id={id} />
  if (page === "meldingen") return <NotificationsPage />
  if (page === "instellingen") {
    const tab = TABS.find((t) => t === id) ?? "profiel"
    return <SettingsPage tab={tab} />
  }
  return <SupplierDashboard />
}

const PAGE_LABEL: Readonly<Record<string, string>> = {
  bestellingen: "Bestellingen",
  producten: "Producten",
  chats: "Chats",
  afrekeningen: "Afrekeningen",
  training: "Training",
  meldingen: "Meldingen",
  instellingen: "Instellingen"
}

const SOFIA = { kind: "person" as const, label: "Sofía Kim", meta: "Northwind · CX-lead" }

/**
 * The werkdraad in the portal runs page → record → the person at Northwind it leads to: an order to
 * the product and Sofía (who reads the channel), the Aurora to her size-table change. No Magnus here.
 */
function thread(route: AreaRoute): Thread {
  const [page, id] = route.path
  const home = { kind: "page" as const, label: ME.name, href: paths.supplierPortal() }
  if (page === undefined) return { items: [home], ask: null }
  const section = {
    kind: "page" as const,
    label: PAGE_LABEL[page] ?? "Leveranciersportaal",
    href: paths.supplierPortal(page)
  }
  if (page === "bestellingen" && id !== undefined) {
    const order = supplierRows(false).find((o) => o.number === id)
    const line = order?.lines[0]
    return {
      items: [
        section,
        { kind: "order", label: `#${id}`, ...(order === undefined ? {} : { meta: `${order.units} stuks` }) },
        ...(line === undefined
          ? []
          : [{
            kind: "product" as const,
            label: line.title,
            href: paths.supplierPortal(`producten/${line.productId}`)
          }]),
        {
          ...SOFIA,
          href: `${paths.supplierPortal("chats")}?over=${id}`,
          peek: ["Leest mee in #allure-fulfillment", "Vraag haar iets over deze bestelling"]
        }
      ],
      ask: null
    }
  }
  if (page === "producten" && id !== undefined) {
    const product = SUP_PRODUCTS.find((p) => p.id === id)
    return {
      items: [
        section,
        { kind: "product", label: product?.name ?? "Product" },
        ...(id === AURORA_SIZES.productId
          ? [{
            ...SOFIA,
            href: paths.supplierPortal("chats"),
            meta: `wijzigde de maattabel · ${AURORA_SIZES.changedAt}`
          }]
          : [])
      ],
      ask: null
    }
  }
  if (page === "chats") {
    return {
      items: [section, { kind: "chat", label: "#allure-fulfillment" }, SOFIA, {
        kind: "person",
        label: "Elena Hart",
        meta: "Northwind · Eigenaar"
      }],
      ask: null
    }
  }
  if (page === "afrekeningen" && id !== undefined) {
    const s = allureStatements().find((x) => x.id === id)
    return { items: [section, { kind: "page", label: s?.label ?? "Maand" }], ask: null }
  }
  if (page === "training" && id !== undefined) {
    const c = COURSES.find((x) => x.id === id)
    return { items: [section, { kind: "course", label: c?.title ?? "Cursus", meta: "Elena Hart" }], ask: null }
  }
  return { items: [section], ask: null }
}

/** The supplier portal: Allure Fulfillment, signed in to work Northwind's orders. */
export const area: AreaDef = {
  Screen,
  thread,
  portal: {
    name: "Leveranciersportaal",
    who: ME.name,
    nav: NAV,
    current: (route) => route.path[0] ?? "overzicht"
  }
}
