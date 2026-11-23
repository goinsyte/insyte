import type { ComponentType, ReactNode } from "react"
import type { Glyph } from "./fixtures/agents.ts"
import type { AreaId, AreaRoute } from "./router.tsx"
import { area as affiliatePortal } from "./screens/affiliate-portal/area.tsx"
import { area as affiliates } from "./screens/affiliates/area.tsx"
import { area as auth } from "./screens/auth/area.tsx"
import { area as automations } from "./screens/automations/area.tsx"
import { area as chargebacks } from "./screens/chargebacks/area.tsx"
import { area as costs } from "./screens/costs/area.tsx"
import { area as courses } from "./screens/courses/area.tsx"
import { area as customers } from "./screens/customers/area.tsx"
import { area as data } from "./screens/data/area.tsx"
import { area as inbox } from "./screens/inbox/area.tsx"
import { area as magnus } from "./screens/magnus/area.tsx"
import { area as marketplace } from "./screens/marketplace/area.tsx"
import { area as notifications } from "./screens/notifications/area.tsx"
import { area as orders } from "./screens/orders/area.tsx"
import { area as products } from "./screens/products/area.tsx"
import { area as publicPages } from "./screens/public/area.tsx"
import { area as returns } from "./screens/returns/area.tsx"
import { area as settings } from "./screens/settings/area.tsx"
import { area as sheets } from "./screens/sheets/area.tsx"
import { area as supplierPortal } from "./screens/supplier-portal/area.tsx"
import { area as suppliers } from "./screens/suppliers/area.tsx"
import type { Thread } from "./shell/threads.ts"
import type { View } from "./view.ts"

/**
 * The areas of `/v2`, one folder each. An area is three things the shell asks of it:
 *
 *   Screen   the page for a route under the area's prefixes (`router.tsx`, `AREA_PREFIXES`); it reads
 *            `route.path` and `route.search` and draws its own pages, states, sheets and dialogs
 *   thread   the werkdraad for that page: the thing itself, then the records it touches
 *   Menu     the menu (sub-panel) body when the area owns its rail section; built from the pieces in
 *            `shell/nav.tsx`, never redrawn
 *   portal   for the affiliate and supplier portals only: who is signed in and the portal's own nav
 *
 * The convention: `screens/<area>/area.tsx` exports `area`, the rest of the folder is the area's own,
 * and its demo data lives in `fixtures/<area>.ts`, built on the shared records (`fixtures/records.ts`).
 * An area never imports another area's folder; it links to it with `paths`.
 */
export type AreaProps = { readonly route: AreaRoute }
export type MenuProps = { readonly route: AreaRoute; readonly pathname: string }

export type PortalNavItem = {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly glyph: Glyph
  readonly alert?: number
}

export type AreaDef = {
  readonly Screen: ComponentType<AreaProps>
  readonly thread: (route: AreaRoute) => Thread
  readonly Menu?: ComponentType<MenuProps>
  readonly portal?: {
    /** The portal's name in the dark corner: "Leveranciersportaal". */
    readonly name: string
    /** Who is signed in: "Allure Fulfillment", or by the view (an affiliate's state changes who). */
    readonly who: string | ((view: View) => string)
    /** The portal's pages; by the view where the nav changes with it (an affiliate not yet approved). */
    readonly nav: ReadonlyArray<PortalNavItem> | ((view: View) => ReadonlyArray<PortalNavItem>)
    /** Which nav item is current for a route. */
    readonly current: (route: AreaRoute) => string
    /** What the bar shows on the right besides the avatar, if anything. */
    readonly bar?: ReactNode
  }
}

export const AREAS: Readonly<Record<AreaId, AreaDef>> = {
  inbox,
  orders,
  returns,
  chargebacks,
  customers,
  products,
  suppliers,
  affiliates,
  automations,
  sheets,
  courses,
  costs,
  data,
  marketplace,
  notifications,
  settings,
  magnus,
  "affiliate-portal": affiliatePortal,
  "supplier-portal": supplierPortal,
  auth,
  public: publicPages
}
