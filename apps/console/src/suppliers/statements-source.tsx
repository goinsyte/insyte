import { useAtomSet } from "@effect/atom-react"
import type {
  StatementDetail,
  StatementLine,
  StatementList,
  StatementRow
} from "@insyte/modules/suppliers/domain/Statements"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type {
  StatementLineView,
  StatementSource,
  StatementsSource,
  StatementView
} from "@insyte/ui/app/supplier/statements-source"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { useMemo, useState } from "react"
import { PRODUCTS } from "../data/products.ts"
import { SUPPLIERS, supplierWrites } from "../data/suppliers.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * A supplier's statements in the console (M13 step 6): the brand's side of the design's supplier pages, over
 * `Suppliers.statements` and `Suppliers.statement`. The amounts are the server's minor units in the statement's
 * currency, to the cent; the invoice is the file the close made (`/api/files/:id`); "Als betaald markeren" is Beheren's,
 * with Undo. The running month ("Lopend") has no invoice until the 1st.
 */

const keys = { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }

const MONTH = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })

const monthLabel = (month: string) => {
  const label = MONTH.format(new Date(`${month}-15T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const moneyIn = (currency: string) => (amount: number) =>
  formatCurrency(amount, currency as Currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const viewOf = (r: StatementRow): StatementView => ({
  id: r.month,
  label: monthLabel(r.month),
  shippedLines: r.shippedLines,
  shipped: r.shippedMinor / 100,
  corrections: r.correctionsMinor / 100,
  total: r.totalMinor / 100,
  status: r.status,
  // The day it was paid, once it is; in UTC, so the server's page and the tab's agree.
  payDay: r.status === "paid" && r.paidAt !== null ? new Date(r.paidAt).toISOString().slice(0, 10) : r.payDay
})

const lineOf = (l: StatementLine): StatementLineView => ({
  id: l.id,
  order: l.orderNumber,
  day: l.day,
  title: l.title,
  qty: l.qty,
  unit: l.unitCostMinor === null ? null : l.unitCostMinor / 100,
  total: l.totalMinor / 100,
  kind: l.kind,
  reason: l.reason ?? undefined,
  missing: l.missing ?? undefined
})

const listOf = (supplierId: string) => `/suppliers/${supplierId}/statements`

const crumbsOf = (supplierName: string) => [{ label: "Leveranciers", to: "/suppliers" }, { label: supplierName }]

/** The months of one supplier, newest first; the running month leads while it has lines. */
export function useConsoleStatements(list: StatementList): StatementsSource {
  const navigate = useNavigate()
  const { supplier, summary } = list
  return useMemo(() => ({
    meta: `Je betaalt op de ${summary.payDay}e voor de maand ervoor`,
    crumbs: crumbsOf(supplier.name),
    rows: list.rows.map(viewOf),
    paidThisYear: summary.paidYtdMinor / 100,
    money: moneyIn(summary.currency),
    open: (row) =>
      void navigate({
        to: "/suppliers/$supplierId/statements/$month",
        params: { supplierId: supplier.id, month: row.id }
      }),
    empty: (
      <p className="py-12 text-center text-ink-3 text-sm">
        Nog geen afrekeningen. Wat {supplier.name} verzendt, staat hier per maand; op de 1e sluit de maand ervoor af.
      </p>
    )
  }), [list, navigate, supplier, summary])
}

const COPY = { gone: "Die afrekening bestaat niet meer" }

/** One month line by line, its invoice, and marking it paid. */
export function useConsoleStatement(detail: StatementDetail): StatementSource {
  const { statement: s } = detail
  const gate = useGate("suppliers", 3)
  const [busy, setBusy] = useState(false)
  const markPaid = useAtomSet(supplierWrites.markStatementPaid, { mode: "promiseExit" })
  const undo = useAtomSet(supplierWrites.undo, { mode: "promiseExit" })
  const label = monthLabel(s.month)

  const pay = async () => {
    if (s.id === null) return
    setBusy(true)
    const exit = await markPaid({ payload: { id: s.id }, ...keys })
    setBusy(false)
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(
      `${label} als betaald gemarkeerd`,
      () =>
        void undo({ payload: { token: ticket.token }, ...keys }).then((done) => {
          if (Exit.isFailure(done)) sayRefusal(failureOf(done), COPY)
        })
    )
  }

  const fileId = s.invoiceFileId
  return {
    statement: viewOf(s),
    lines: detail.lines.map(lineOf),
    crumbs: [...crumbsOf(s.supplierName), { label: "Afrekeningen", to: listOf(s.supplierId) }],
    money: moneyIn(s.currency),
    download: fileId === null
      ? {
        reason: s.status === "open"
          ? "De factuur komt op de 1e, als de maand is afgesloten"
          : "De factuur wordt nog gemaakt"
      }
      : {
        run: () => {
          const a = document.createElement("a")
          a.href = `/api/files/${fileId}`
          a.download = `factuur-${s.supplierName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${s.month}`
          a.click()
        }
      },
    pay: { ok: gate.ok, reason: gate.reason, busy, run: () => void pay() }
  }
}
