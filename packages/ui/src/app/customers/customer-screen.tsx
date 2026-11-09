import { Link } from "@tanstack/react-router"
import { Mail, MessageSquare } from "../../icons"
import { DetailShell } from "../common/detail-shell"
import { EmptyState } from "../common/empty-state"
import { formatCurrency, formatDate, initials } from "../lib/format"
import { personStyle } from "../lib/person-color"
import { OrderStatusBadge } from "../orders/order-status-badge"
import { useCustomerDetailSource } from "./detail-source"

/*
 * One customer, as `detail-source.tsx` gives it: the design app's from its demo workspace, the console's from
 * `Customers.get`. What the host does not have is left out: no "Nieuw ticket" without a board, no merge notice, Klaviyo
 * line or returns without them.
 */

export function CustomerDetail() {
  const { customer, orders: customerOrders, currency, lastOrderAt, merged, klaviyo, newTicket, Returns, arriving } =
    useCustomerDetailSource()
  const mergedInto = merged?.into
  const absorbed = merged?.absorbed ?? 0
  const avgOrderValue = customer.orders_count > 0
    ? customer.lifetime_value / customer.orders_count
    : 0

  return (
    <DetailShell
      crumb={{ label: "Klanten", to: "/customers" }}
      arriving={arriving}
      title={
        <span className="flex items-center gap-2.5">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full font-medium text-2xs"
            style={personStyle(customer.name)}
            aria-hidden
          >
            {initials(customer.name)}
          </span>
          {customer.name}
        </span>
      }
      meta={
        <>
          {customer.email}
          {customer.address?.country ? ` · ${customer.address.country}` : ""}
          {` · ${customer.orders_count} ${customer.orders_count === 1 ? "bestelling" : "bestellingen"}`}
        </>
      }
      actions={
        <>
          {customer.email ?
            (
              <a
                href={`mailto:${customer.email}`}
                className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink transition-colors hover:bg-ink/6"
              >
                <Mail className="size-3.5" strokeWidth={1.75} />
                E-mailen
              </a>
            ) :
            null}
          {newTicket ?
            (
              <button
                type="button"
                onClick={newTicket}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-2.5 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
              >
                <MessageSquare className="size-3.5" strokeWidth={1.75} />
                Nieuw ticket
              </button>
            ) :
            null}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* KPI strip */}
        {mergedInto ?
          (
            <p className="rounded-lg bg-arc-tint px-3.5 py-2.5 text-base text-arc-ink">
              Dit profiel is samengevoegd met{" "}
              <Link
                to="/customers/$customerId"
                params={{ customerId: mergedInto.id }}
                className="font-medium underline underline-offset-2"
              >
                {mergedInto.name}
              </Link>
              . De bestellingen tellen nu daar mee.
            </p>
          ) :
          absorbed > 0 ?
          (
            <p className="rounded-lg bg-mist px-3.5 py-2.5 text-base text-ink-2">
              {absorbed + 1} profielen samengevoegd tot dit profiel. Hun bestellingen en waarde tellen hier mee.
            </p>
          ) :
          null}
        <div className="panel flex w-full overflow-hidden rounded-lg">
          <KpiCell
            label="Klantwaarde"
            value={formatCurrency(customer.lifetime_value, currency)}
          />
          <KpiCell label="Bestellingen" value={customer.orders_count.toString()} />
          <KpiCell
            label="Gem. bestelling"
            value={customer.orders_count > 0 ? formatCurrency(avgOrderValue, currency) : "—"}
          />
          <KpiCell
            label="Laatste bestelling"
            value={lastOrderAt ? formatDate(lastOrderAt) : "—"}
            last
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
          {/* Orders */}
          <section className="panel flex flex-col gap-3 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-xs text-ink-2">
                Bestellingen · {customerOrders.length}
              </span>
              {customerOrders.length > 0 ?
                (
                  <span className="text-sm text-ink-3 leading-none">
                    <span className="tabular-nums">
                      {Math.min(20, customerOrders.length)}
                    </span>{" "}
                    van{" "}
                    <span className="tabular-nums">
                      {customerOrders.length}
                    </span>
                  </span>
                ) :
                null}
            </div>

            {customerOrders.length === 0 ?
              (
                <EmptyState
                  compact
                  kind="orders"
                  title="Nog geen bestellingen."
                  body={`Zodra ${customer.name.split(" ")[0]} bestelt, verschijnt de bestelling hier.`}
                />
              ) :
              (
                <ul className="flex flex-col divide-y divide-ink/7">
                  {customerOrders.slice(0, 20).map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-3">
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="font-medium tabular-nums text-base text-ink tabular-nums transition-colors hover:text-arc-ink"
                      >
                        {o.number}
                      </Link>
                      <OrderStatusBadge status={o.status} />
                      <span className="ml-auto flex items-center gap-3">
                        <span className="tabular-nums text-sm text-ink-3 tabular-nums">
                          {formatDate(o.created_at)}
                        </span>
                        <span className="font-medium tabular-nums text-base text-ink tabular-nums">
                          {formatCurrency(o.total, currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          {/* Sidebar */}
          <aside className="flex flex-col gap-3">
            {Returns ? <Returns email={customer.email} /> : null}
            <section className="panel flex flex-col gap-3 rounded-lg p-4">
              <span className="font-medium text-xs text-ink-2">
                Contact
              </span>
              <dl className="flex flex-col gap-2.5 text-base">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">E-mail</dt>
                  <dd className="truncate tabular-nums text-ink-2">
                    {customer.email}
                  </dd>
                </div>
                {customer.phone ?
                  (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-3">Telefoon</dt>
                      <dd className="tabular-nums text-ink-2">{customer.phone}</dd>
                    </div>
                  ) :
                  null}
                {customer.address?.country ?
                  (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-3">Land</dt>
                      <dd className="font-medium text-ink-2">
                        {customer.address.country}
                      </dd>
                    </div>
                  ) :
                  null}
                {(merged?.alsoEmails ?? []).map((e) => (
                  <div key={e} className="flex items-baseline justify-between gap-3">
                    <dt className="text-ink-3">Ook</dt>
                    <dd className="truncate text-ink-2">{e}</dd>
                  </div>
                ))}
                {klaviyo ?
                  (
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-ink-3">Klaviyo</dt>
                      <dd className="truncate text-ink-2">
                        {klaviyo.list} · {formatDate(klaviyo.at)}
                      </dd>
                    </div>
                  ) :
                  null}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-3">Klant-ID</dt>
                  <dd className="tabular-nums text-ink-2 tabular-nums">
                    {customer.id}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="panel flex flex-col gap-3 rounded-lg p-4">
              <span className="font-medium text-xs text-ink-2">
                Labels
              </span>
              {customer.tags.length > 0 ?
                (
                  <div className="flex flex-wrap gap-1.5">
                    {customer.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex h-6 items-center rounded-md bg-arc-tint px-2 font-medium text-sm text-arc-ink leading-none"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) :
                (
                  <p className="text-sm text-ink-3 leading-none">
                    Nog geen labels.
                  </p>
                )}
            </section>
          </aside>
        </div>
      </div>
    </DetailShell>
  )
}

function KpiCell({
  label,
  value,
  last
}: {
  label: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-1 px-4 py-3 ${last ? "" : "border-ink/7 border-r"}`}
    >
      <span className="font-medium text-xs text-ink-3">
        {label}
      </span>
      <span className="font-medium text-xl text-ink tabular-nums">
        {value}
      </span>
    </div>
  )
}
