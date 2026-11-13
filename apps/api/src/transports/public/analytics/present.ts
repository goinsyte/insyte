import type { AnalyticsOverview } from "@insyte/modules/analytics/domain/Analytics"

/* Analyse's overview in the public shape: the two months' spans and the six figures, each with what it rests on. */

const span = (x: AnalyticsOverview["A"]) => ({
  month: x.month,
  from: x.from,
  to: x.to,
  days: x.days,
  in_progress: x.inProgress
})

export const overviewV1 = (o: AnalyticsOverview) => ({
  currency: o.currency,
  a: span(o.A),
  b: span(o.B),
  figures: o.figures.map((f) => ({
    id: f.id,
    a: f.a,
    b: f.b,
    available: f.available,
    basis: { rows: f.basis.rows, by: f.basis.by, a_count: f.basis.a, b_count: f.basis.b }
  })),
  orders_total: o.basis.orders,
  tickets_total: o.basis.tickets,
  first_order_day: o.basis.since,
  unconverted: o.unconverted
})
