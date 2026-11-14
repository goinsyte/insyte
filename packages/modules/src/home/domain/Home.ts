import { Schema } from "effect"

/*
 * Start's figures (M10.3; widgets/02 Part A, §0): the hero's counts, the pulse band, and the board's widgets in one
 * batched read. Every figure names the rows it sums over, from the live tables until the facts tables land (12.4). A
 * figure the role may not read is left out, never zeroed; a widget whose source milestone has not landed (automations
 * M12, AI M15, chats) is not built here, and the console says so on its card. Money is in minor units
 * of the workspace currency (`workspaces.currency`); an order in another currency is converted at the `fx_rates` row
 * of its placed day, and one without a rate is left out and counted in `unconverted`. Days are the store's own
 * (`stores.timezone`, else the workspace's), so a sum over stores adds each store's days.
 */

/** The board's window: the N calendar days ending today, against the N days before (`user_prefs.board.range`). */
export const BoardRange = Schema.Literals([7, 30, 90])
export type BoardRange = typeof BoardRange.Type

/** The board's cards, as `user_prefs.board.widgets` names them. */
export const WIDGET_IDS = [
  "queue",
  "setup",
  "todo",
  "revenue",
  "orders",
  "chargebacks",
  "suppliers",
  "tickets",
  "stock",
  "automations",
  "mytickets",
  "team",
  "today",
  "live",
  "mentions",
  "recent",
  "insyte",
  "bestsellers",
  "bookmarks",
  "countries",
  "chats",
  "customeragent",
  "returns"
] as const
export const WidgetId = Schema.Literals(WIDGET_IDS)
export type WidgetId = typeof WidgetId.Type

/* ── the hero ──────────────────────────────────────────────────────────────────────────────────── */

export class HomeBrief extends Schema.Class<HomeBrief>("home/HomeBrief")({
  /** Open queue rows, red or amber, that the role may open: the hero's figure. */
  needsYou: Schema.Int,
  /** Orders delayed now (`delayed_at` set, still on their way); `null` without Bestellingen. */
  delayed: Schema.NullOr(Schema.Int),
  /** Open tickets of high priority; `null` without Klantenservice. */
  urgent: Schema.NullOr(Schema.Int),
  /** Chargebacks waiting on evidence (open or waiting for it); `null` without Chargebacks. */
  evidence: Schema.NullOr(Schema.Int),
  /** The first day: no orders and nothing open in the queue. Start is then the first-run page. */
  firstDay: Schema.Boolean
}) {}

/* ── the pulse ─────────────────────────────────────────────────────────────────────────────────── */

/** A windowed figure: window A, window B, and A cut into at most 14 buckets, oldest first. */
const Windowed = Schema.Struct({ value: Schema.Int, previous: Schema.Int, spark: Schema.Array(Schema.Int) })

export const PulseFigures = Schema.Struct({
  /** Whether window B lies inside the workspace's history (its first order); without it no change is said. */
  comparable: Schema.Boolean,
  /** Counted revenue (§0.1) by placed day. Needs Analyse and Bestellingen. */
  revenue: Schema.optionalKey(Windowed),
  /** Counted orders by placed day. Needs Analyse and Bestellingen. */
  orders: Schema.optionalKey(Windowed),
  /** Open tickets now; the change and the spark are on tickets created. Needs Klantenservice. */
  tickets: Schema.optionalKey(Schema.Struct({
    open: Schema.Int,
    created: Schema.Int,
    createdBefore: Schema.Int,
    spark: Schema.Array(Schema.Int)
  })),
  /**
   * Parcels delivered in the window by the day they arrived, and of those the ones whose order Insyte never marked
   * delayed (`orders.delayed_at`); the spark is the on-time share per bucket, `null` where nothing arrived. Needs
   * Analyse.
   */
  ontime: Schema.optionalKey(Schema.Struct({
    delivered: Schema.Int,
    onTime: Schema.Int,
    deliveredBefore: Schema.Int,
    onTimeBefore: Schema.Int,
    spark: Schema.Array(Schema.NullOr(Schema.Finite))
  })),
  /**
   * "Eerste reactie": tickets that came in during the window and were answered, and the minutes from coming in to the
   * first mail the team sent on them (a thread linked to the ticket); the spark is the mean hours per bucket, `null`
   * where none were answered. Needs Klantenservice.
   */
  reply: Schema.optionalKey(Schema.Struct({
    replied: Schema.Int,
    minutes: Schema.Int,
    repliedBefore: Schema.Int,
    minutesBefore: Schema.Int,
    spark: Schema.Array(Schema.NullOr(Schema.Finite))
  }))
})
export type PulseFigures = typeof PulseFigures.Type

/* ── the widgets ───────────────────────────────────────────────────────────────────────────────── */

export const RevenueWidget = Schema.Struct({
  totalMinor: Schema.Int,
  previousMinor: Schema.Int,
  /** Whole percent against window B, `null` when B is 0. */
  change: Schema.NullOr(Schema.Int),
  /** Per day up to 31 days, per week (from Monday) beyond: the bucket's first day. */
  points: Schema.Array(Schema.Struct({ day: Schema.String, valueMinor: Schema.Int, orders: Schema.Int })),
  weekly: Schema.Boolean
})

export const STAGES = ["placed", "paid", "at_supplier", "shipped", "delivered"] as const
export const OrdersWidget = Schema.Struct({
  /** Orders placed in window A, by their status now; cancelled and refunded are left out. */
  stages: Schema.Struct({
    placed: Schema.Int,
    paid: Schema.Int,
    at_supplier: Schema.Int,
    shipped: Schema.Int,
    delivered: Schema.Int
  }),
  /** Of those, the ones delayed and still on their way. */
  delayed: Schema.Int
})

export const SuppliersWidget = Schema.Struct({
  /** The five suppliers holding the most delayed, then most open orders. */
  rows: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, open: Schema.Int, delayed: Schema.Int }))
})

export const TicketsWidget = Schema.Struct({
  /** The board's columns: tickets not archived, binned or spam. */
  columns: Schema.Struct({
    intake: Schema.Int,
    in_progress: Schema.Int,
    awaiting_reply: Schema.Int,
    done: Schema.Int
  }),
  /** Open tickets of high priority. */
  high: Schema.Int
})

export const MyTicketsWidget = Schema.Struct({
  rows: Schema.Array(Schema.Struct({
    id: Schema.String,
    number: Schema.String,
    title: Schema.String,
    priority: Schema.Literals(["low", "medium", "high"])
  })),
  /** Every open ticket assigned to the person, of which `rows` are the first five. */
  total: Schema.Int
})

/** At or under this many left, a variant is running low (widgets/02 `stock`). */
export const LOW_STOCK = 12

export const StockWidget = Schema.Struct({
  rows: Schema.Array(Schema.Struct({
    variantId: Schema.String,
    productId: Schema.String,
    product: Schema.String,
    variant: Schema.String,
    sku: Schema.NullOr(Schema.String),
    left: Schema.Int
  }))
})

export const ReturnsWidget = Schema.Struct({
  rows: Schema.Array(Schema.Struct({
    id: Schema.String,
    number: Schema.String,
    customerName: Schema.String,
    status: Schema.Literals(["review", "ready"]),
    /** In review past its deadline. */
    late: Schema.Boolean
  }))
})

export const LiveWidget = Schema.Struct({
  /** Orders placed today in the store's day, paid or not, and their value. */
  today: Schema.Struct({ count: Schema.Int, sumMinor: Schema.Int }),
  /** The last six orders placed. */
  recent: Schema.Array(Schema.Struct({
    id: Schema.String,
    number: Schema.String,
    customer: Schema.String,
    qty: Schema.Int,
    title: Schema.String,
    productId: Schema.NullOr(Schema.String),
    image: Schema.NullOr(Schema.String),
    totalMinor: Schema.Int,
    currency: Schema.String,
    country: Schema.NullOr(Schema.String),
    at: Schema.Finite
  }))
})

export const BestsellersWidget = Schema.Struct({
  /** Units and counted line value of the counted orders in window A, top five by units. */
  rows: Schema.Array(Schema.Struct({
    productId: Schema.String,
    title: Schema.String,
    image: Schema.NullOr(Schema.String),
    units: Schema.Int,
    revenueMinor: Schema.Int,
    /** Available now, over the product's variants and locations. */
    stock: Schema.Int
  }))
})

export const CountriesWidget = Schema.Struct({
  /** Counted orders in window A by shipping country (`null` without an address). */
  rows: Schema.Array(Schema.Struct({ country: Schema.NullOr(Schema.String), orders: Schema.Int }))
})

export const ChargebacksWidget = Schema.Struct({
  /** Cases open or waiting for evidence. */
  open: Schema.Int,
  /** What those cases dispute, in the workspace currency (a case in a currency without a rate is left out). */
  atStakeMinor: Schema.Int,
  won: Schema.Int,
  /** Won or lost. */
  decided: Schema.Int,
  submitted: Schema.Int,
  /** The open case whose deadline is nearest. */
  nearest: Schema.NullOr(Schema.Struct({
    id: Schema.String,
    caseNumber: Schema.String,
    customerName: Schema.String,
    deadlineAt: Schema.Finite
  }))
})

export const WidgetPayloads = Schema.Struct({
  revenue: Schema.optionalKey(RevenueWidget),
  orders: Schema.optionalKey(OrdersWidget),
  chargebacks: Schema.optionalKey(ChargebacksWidget),
  suppliers: Schema.optionalKey(SuppliersWidget),
  tickets: Schema.optionalKey(TicketsWidget),
  mytickets: Schema.optionalKey(MyTicketsWidget),
  stock: Schema.optionalKey(StockWidget),
  returns: Schema.optionalKey(ReturnsWidget),
  live: Schema.optionalKey(LiveWidget),
  bestsellers: Schema.optionalKey(BestsellersWidget),
  countries: Schema.optionalKey(CountriesWidget)
})
export type WidgetPayloads = typeof WidgetPayloads.Type

export const WidgetsInput = Schema.Struct({
  ids: Schema.Array(WidgetId),
  range: BoardRange
})
export type WidgetsInput = typeof WidgetsInput.Type

export class HomeWidgets extends Schema.Class<HomeWidgets>("home/HomeWidgets")({
  currency: Schema.String,
  range: BoardRange,
  pulse: PulseFigures,
  /** The asked widgets the role may read; one it may not, or one not built yet, is absent. */
  widgets: WidgetPayloads,
  /** Orders in window A left out of the money figures for want of an exchange rate. */
  unconverted: Schema.Int
}) {}

/* ── "Waar €X vandaan komt" ────────────────────────────────────────────────────────────────────── */

export const BreakdownInput = Schema.Struct({ range: BoardRange })

export class RevenueBreakdown extends Schema.Class<RevenueBreakdown>("home/RevenueBreakdown")({
  currency: Schema.String,
  range: BoardRange,
  /** The revenue widget's figure: the same counted orders. */
  totalMinor: Schema.Int,
  count: Schema.Int,
  previousMinor: Schema.Int,
  byStore: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String, valueMinor: Schema.Int })),
  /** Line value (quantity × unit price) by product, top five by value. */
  byProduct: Schema.Array(Schema.Struct({
    productId: Schema.NullOr(Schema.String),
    title: Schema.String,
    units: Schema.Int,
    valueMinor: Schema.Int
  })),
  restCount: Schema.Int,
  restMinor: Schema.Int,
  /** Shipping and tax, less discounts, of the counted orders, as stated on them. */
  shippingTaxDiscountsMinor: Schema.Int,
  excluded: Schema.Struct({ cancelled: Schema.Int, refunded: Schema.Int, unpaid: Schema.Int }),
  /** The distinct rates a conversion used. */
  rates: Schema.Array(
    Schema.Struct({ day: Schema.String, base: Schema.String, quote: Schema.String, rate: Schema.Finite })
  ),
  unconverted: Schema.Int
}) {}
