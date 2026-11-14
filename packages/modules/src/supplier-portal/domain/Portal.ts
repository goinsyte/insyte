import { Context, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The supplier portal as its contact reads it (M16 step 2; widgets/06 Part A). Everything here is the supplier's own
 * projection: its lines of an order and what the brand pays for them, the parcel's address without the customer's
 * email or phone, the brand's note for suppliers (never the internal note), its products without prices. Money is in
 * minor units of the order's currency; times are epoch ms.
 */

/** What the brand opened to the contact (`supplier_contacts.portal_scopes`); `orders` is always on. */
export const PortalScope = Schema.Literals(["orders", "stock", "statements", "chat", "media"])
export type PortalScope = typeof PortalScope.Type

/** The supplier contact the request acts as, beside its `CurrentPrincipal` (provided by the portal's middleware). */
export interface SupplierContact {
  readonly contactId: string
  readonly contactName: string
  readonly role: "owner" | "staff"
  readonly scopes: ReadonlyArray<PortalScope>
  readonly supplierId: string
  readonly supplierName: string
  readonly workspaceName: string
}

export class CurrentSupplierContact extends Context.Service<CurrentSupplierContact, SupplierContact>()(
  "supplier-portal/CurrentSupplierContact"
) {}

/** The person is signed in, but holds no supplier portal access (or it was revoked): the portal's pages are 404. */
export class NotSupplierContact extends Schema.TaggedError<NotSupplierContact>()("NotSupplierContact", {}) {}

/** The brand did not open this part of the portal to the contact. */
export class ScopeMissing extends Schema.TaggedError<ScopeMissing>()("ScopeMissing", { scope: PortalScope }) {}

export const SupplierStatus = Schema.Literals(["to_accept", "to_ship", "problem", "shipped", "closed"])
export type SupplierStatus = typeof SupplierStatus.Type

/** Where the hand-off stands, in the supplier's timezone. */
export const Due = Schema.Literals(["late", "today", "soon", "later"])
export type Due = typeof Due.Type

export const ProblemKind = Schema.Literals(["stock", "delay", "address", "damaged", "other"])
export type ProblemKind = typeof ProblemKind.Type

export const Carrier = Schema.Literals(["PostNL", "DHL", "DPD", "UPS", "GLS", "FedEx"])
export type Carrier = typeof Carrier.Type

export const SupplierView = Schema.Literals(["to_accept", "to_ship", "late", "problem", "shipped", "all", "open"])
export type SupplierView = typeof SupplierView.Type

export class SupplierMe extends Schema.Class<SupplierMe>("supplier-portal/SupplierMe")({
  contact: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    role: Schema.Literals(["owner", "staff"]),
    scopes: Schema.Array(PortalScope)
  }),
  supplier: Schema.Struct({ id: Schema.String, name: Schema.String, timezone: Schema.String }),
  /** The brand: its name and logo, never switchable inside a session. */
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String, logoFileId: Schema.NullOr(Schema.String) })
}) {}

/** One of the supplier's own lines on an order: no shelf price, only what the brand pays for it. */
export const SupplierLine = Schema.Struct({
  id: Schema.String,
  productId: Schema.NullOr(Schema.String),
  variantId: Schema.NullOr(Schema.String),
  sku: Schema.NullOr(Schema.String),
  title: Schema.String,
  variantTitle: Schema.NullOr(Schema.String),
  quantity: Schema.Int,
  /** The product's cost price; `null` when the brand set none. */
  unitCostMinor: Schema.NullOr(Schema.Int),
  image: Schema.NullOr(Schema.String)
})
export type SupplierLine = typeof SupplierLine.Type

export class SupplierOrderRow extends Schema.Class<SupplierOrderRow>("supplier-portal/SupplierOrderRow")({
  id: Schema.String,
  number: Schema.String,
  status: SupplierStatus,
  due: Due,
  /** When it has to be with the carrier; `null` before the leg has a deadline. */
  handoffBy: Schema.NullOr(Schema.Finite),
  placedAt: Schema.Finite,
  lines: Schema.Array(SupplierLine),
  units: Schema.Int,
  /** "Jouw bedrag": Σ cost × quantity over the lines that have a cost. */
  amountMinor: Schema.Int,
  /** A line has no cost price, so the amount leaves it out. */
  costMissing: Schema.Boolean,
  currency: Schema.String,
  city: Schema.String,
  country: Schema.String
}) {}

export const OrderCounts = Schema.Struct({
  toAccept: Schema.Int,
  toShip: Schema.Int,
  late: Schema.Int,
  today: Schema.Int,
  problem: Schema.Int,
  shipped: Schema.Int,
  all: Schema.Int
})
export type OrderCounts = typeof OrderCounts.Type

export class SupplierOrderList extends Schema.Class<SupplierOrderList>("supplier-portal/SupplierOrderList")({
  rows: Schema.Array(SupplierOrderRow),
  counts: OrderCounts
}) {}

export const ShipTo = Schema.Struct({
  name: Schema.String,
  line1: Schema.NullOr(Schema.String),
  line2: Schema.NullOr(Schema.String),
  postcode: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String)
})
export type ShipTo = typeof ShipTo.Type

export const Problem = Schema.Struct({
  kind: ProblemKind,
  note: Schema.String,
  /** `YYYY-MM-DD`. */
  newDate: Schema.NullOr(Schema.String),
  at: Schema.Finite
})

export const Parcel = Schema.Struct({
  carrier: Schema.NullOr(Schema.String),
  tracking: Schema.String,
  url: Schema.NullOr(Schema.String),
  at: Schema.Finite
})

export const OrderEvent = Schema.Struct({
  kind: Schema.Literals(["placed", "accepted", "problem_reported", "shipped"]),
  at: Schema.Finite,
  problem: Schema.optional(ProblemKind),
  carrier: Schema.optional(Schema.NullOr(Schema.String)),
  tracking: Schema.optional(Schema.String)
})

export class SupplierOrderDetail extends Schema.Class<SupplierOrderDetail>("supplier-portal/SupplierOrderDetail")({
  row: SupplierOrderRow,
  acceptedAt: Schema.NullOr(Schema.Finite),
  shipTo: ShipTo,
  /** "Notitie van <merk>": the note the brand wrote for its suppliers, never the internal one. */
  note: Schema.NullOr(Schema.String),
  problem: Schema.NullOr(Problem),
  parcel: Schema.NullOr(Parcel),
  events: Schema.Array(OrderEvent)
}) {}

/** What a portal write answers: the rows it changed, as they are now, and its undo. */
export class SupplierOrderChange extends Schema.Class<SupplierOrderChange>("supplier-portal/SupplierOrderChange")({
  ok: Schema.Array(Schema.String),
  skipped: Schema.Array(Schema.Struct({ id: Schema.String, reason: Schema.String })),
  undo: Schema.NullOr(UndoTicket)
}) {}

export const StockReporting = Schema.Literals(["live", "in_or_out", "manual"])
export type StockReporting = typeof StockReporting.Type

export const StockState = Schema.Literals(["in_stock", "low", "out"])
export type StockState = typeof StockState.Type

export class SupplierProductRow extends Schema.Class<SupplierProductRow>("supplier-portal/SupplierProductRow")({
  id: Schema.String,
  title: Schema.String,
  image: Schema.NullOr(Schema.String),
  variants: Schema.Int,
  units: Schema.Int,
  stock: StockState,
  /** Orders to accept or to ship with a line of this product. */
  openOrders: Schema.Int,
  leadDays: Schema.Int,
  reporting: StockReporting
}) {}

export class SupplierProductList extends Schema.Class<SupplierProductList>("supplier-portal/SupplierProductList")({
  rows: Schema.Array(SupplierProductRow)
}) {}

export const SupplierVariant = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sku: Schema.NullOr(Schema.String),
  available: Schema.Int,
  /** When the supplier last reported it; `null` while the count is the store's. */
  reportedAt: Schema.NullOr(Schema.Finite)
})

export class SupplierProductDetail
  extends Schema.Class<SupplierProductDetail>("supplier-portal/SupplierProductDetail")({
    row: SupplierProductRow,
    images: Schema.Array(Schema.String),
    variants: Schema.Array(SupplierVariant),
    /** Open orders with this product, soonest hand-off first (at most six). */
    waiting: Schema.Array(Schema.Struct({
      id: Schema.String,
      number: Schema.String,
      quantity: Schema.Int,
      handoffBy: Schema.NullOr(Schema.Finite)
    }))
  })
{}

export class StockChange extends Schema.Class<StockChange>("supplier-portal/StockChange")({
  product: SupplierProductDetail,
  undo: Schema.NullOr(UndoTicket)
}) {}

export const CheckKind = Schema.Literals(["sample", "batch", "test_order"])
export const CheckStatus = Schema.Literals(["requested", "submitted", "approved", "rejected"])

export class SupplierCheckRow extends Schema.Class<SupplierCheckRow>("supplier-portal/SupplierCheckRow")({
  id: Schema.String,
  productId: Schema.String,
  productTitle: Schema.String,
  kind: CheckKind,
  status: CheckStatus,
  variants: Schema.Array(Schema.String),
  deliverables: Schema.Array(Schema.String),
  dueAt: Schema.Finite,
  note: Schema.String,
  submittedAt: Schema.NullOr(Schema.Finite),
  /** "<merk> keurde af: …". */
  rejection: Schema.NullOr(Schema.String)
}) {}

export class SupplierDashboard extends Schema.Class<SupplierDashboard>("supplier-portal/SupplierDashboard")({
  figures: Schema.Struct({
    toAccept: Schema.Int,
    today: Schema.Int,
    late: Schema.Int,
    problemsOpen: Schema.Int,
    /** Every order ever forwarded to the supplier: 0 is the first day's page. */
    totalOrders: Schema.Int
  }),
  /** "Eerst dit": late, today, to accept, then the rest, by hand-off (at most seven). */
  work: Schema.Array(SupplierOrderRow),
  /** "Bijna op": low or sold out, lowest first (at most four). */
  lowStock: Schema.Array(SupplierProductRow),
  checks: Schema.Array(SupplierCheckRow),
  /**
   * "Hoe je levert": the hand-offs of the last eight weeks against their deadline. On time is handed over by
   * `handoff_by`; the carrier's delivery is the brand's to read.
   */
  performance: Schema.Struct({
    weeks: Schema.Array(Schema.Struct({
      /** The week's last day, `YYYY-MM-DD`. */
      end: Schema.String,
      parcels: Schema.Int,
      late: Schema.Int
    })),
    parcels30d: Schema.Int,
    onTime30dPct: Schema.NullOr(Schema.Finite),
    avgDaysLate: Schema.NullOr(Schema.Finite)
  })
}) {}
