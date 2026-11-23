import { CONVERSION_STATUS, METHOD_LABEL, payoutMonths, RETURN_DAYS } from "../../fixtures/affiliate-portal.ts"
import type { PayoutMonth } from "../../fixtures/affiliate-portal.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Download, Wallet } from "../../ui/icons.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import {
  day,
  dayFull,
  dayLong,
  Figures,
  FiguresSkeleton,
  LoadError,
  money,
  TableSkeleton,
  useBook,
  useDataState
} from "./parts.tsx"
import { mask, useAffiliate } from "./store.ts"

const PAYOUT_STATUS = {
  uitbetaald: { label: "Uitbetaald", tone: "good" },
  loopt: { label: "Loopt nog", tone: "warn" }
} as const

/*
 * What was paid and what is coming: the running month on top (how much is approved, how much still
 * inside the return window, when and where it goes), then every month since the start.
 */
export function PayoutsPage() {
  const state = useDataState()
  const book = useBook()
  const { payment } = useAffiliate()
  const months = state === "empty" ? [] : payoutMonths(book)
  const open = months.find((m) => m.status === "loopt")
  const paid = months.filter((m) => m.status === "uitbetaald")
  const paidTotal = paid.reduce((n, m) => n + m.total, 0)
  const approved = open?.rows.filter((c) => c.status === "goedgekeurd").reduce((n, c) => n + c.commission, 0) ?? 0
  const waiting = open?.rows.filter((c) => c.status === "in-retourtermijn").reduce((n, c) => n + c.commission, 0) ?? 0

  return (
    <Page width="wide">
      <PageHead title="Uitbetalingen" meta="Op de 15e, voor de maand ervoor" />
      {state === "loading" ?
        (
          <div aria-busy="true" className="flex flex-col gap-8">
            <FiguresSkeleton />
            <TableSkeleton label="Uitbetalingen laden" />
          </div>
        ) :
        state === "error" ?
        <LoadError what="Je uitbetalingen" /> :
        months.length === 0 ?
        (
          <EmptyState
            glyph={Wallet}
            title="Nog geen uitbetalingen"
            action={<ButtonLink size="sm" to={paths.affiliatePortal("doorverwijzingen")}>Naar je links</ButtonLink>}
          >
            Zodra er een bestelling via je link binnenkomt, verschijnt je commissie hier. Na de retourtermijn van{" "}
            {RETURN_DAYS} dagen wordt hij goedgekeurd en op de 15e uitbetaald.
          </EmptyState>
        ) :
        (
          <div className="flex flex-col gap-10">
            {open !== undefined && (
              <section aria-labelledby="lopend" className="flex flex-col gap-2 rounded-lg bg-well px-5 py-5 sm:px-6">
                <h2 id="lopend" className="text-sm text-ink-2">{open.label} · loopt nog</h2>
                <p className="figure text-4xl text-ink">{money(open.total)}</p>
                <p className="max-w-[62ch] text-sm text-pretty text-ink-2">
                  {money(approved)} goedgekeurd, {money(waiting)} nog binnen de retourtermijn van {RETURN_DAYS}{" "}
                  dagen. Uitbetaling op {dayLong(open.payDay)} naar {METHOD_LABEL[payment.method]},{" "}
                  {mask(payment.account)}.{" "}
                  <Link
                    to={paths.affiliatePortal("instellingen/betaling")}
                    className="text-accent-ink underline-offset-2 hover:underline"
                  >
                    Wijzigen
                  </Link>
                </p>
              </section>
            )}
            <PageSection
              id="maanden"
              title="Per maand"
              meta={`Uitbetaald sinds de start: ${money(paidTotal)}`}
            >
              <Table label="Uitbetalingen per maand" minWidth={680}>
                <THead>
                  <Th>Maand</Th>
                  <Th align="right">Conversies</Th>
                  <Th align="right">Commissie</Th>
                  <Th align="right">Teruggedraaid</Th>
                  <Th align="right">Uitbetaling</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {months.map((m) => (
                    <Tr
                      key={m.id}
                      onOpen={() => navigate(paths.affiliatePortal(`uitbetalingen/${m.id}`))}
                    >
                      <Td header>
                        <Link
                          to={paths.affiliatePortal(`uitbetalingen/${m.id}`)}
                          className="font-medium hover:text-accent-ink"
                        >
                          {m.label}
                        </Link>
                      </Td>
                      <Td figure align="right">{m.rows.length}</Td>
                      <Td figure align="right">{money(m.gross)}</Td>
                      <Td figure align="right" muted>{m.reversed === 0 ? "—" : `− ${money(m.reversed)}`}</Td>
                      <Td figure align="right" className="font-medium">{money(m.total)}</Td>
                      <Td>
                        <Status tone={PAYOUT_STATUS[m.status].tone}>
                          {m.status === "uitbetaald" ? `Betaald ${day(m.payDay)}` : PAYOUT_STATUS[m.status].label}
                        </Status>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </PageSection>
          </div>
        )}
    </Page>
  )
}

/** The month as a file the affiliate keeps for its own books: plain HTML, opens anywhere, prints well. */
function downloadStatement(m: PayoutMonth, name: string) {
  const rows = m.rows
    .map((c) =>
      `<tr><td>#${c.order}</td><td>${day(c.at)}</td><td>${c.title}</td><td>${money(c.total)}</td><td>${
        c.status === "teruggedraaid" ? "teruggedraaid" : money(c.commission)
      }</td></tr>`
    )
    .join("")
  const html =
    `<!doctype html><meta charset="utf-8"><title>Commissie ${m.label}</title><style>body{font:14px system-ui;margin:40px}td,th{padding:4px 12px 4px 0;text-align:left}</style><h1>Commissie ${m.label}</h1><p>${name} · Northwind partnerprogramma</p><p>Commissie ${
      money(m.gross)
    } · teruggedraaid ${money(m.reversed)} · uitbetaling ${
      money(m.total)
    }</p><table><tr><th>Bestelling</th><th>Dag</th><th>Artikel</th><th>Bedrag</th><th>Commissie</th></tr>${rows}</table>`
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `northwind-commissie-${m.id}.html`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* One month: every order that counted, its commission, and what was taken back after a return. */
export function PayoutMonthPage({ id }: { readonly id: string }) {
  const state = useDataState()
  const book = useBook()
  const { name } = useAffiliate()
  const month = payoutMonths(book).find((m) => m.id === id)

  if (state === "loading") {
    return (
      <Page width="wide" label="Uitbetaling">
        <div aria-busy="true" className="flex flex-col gap-8">
          <FiguresSkeleton />
          <TableSkeleton label="Bestellingen laden" />
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="wide" label="Uitbetaling">
        <LoadError what="Deze maand" />
      </Page>
    )
  }
  if (month === undefined || state === "empty") {
    return (
      <Page width="text" label="Maand niet gevonden">
        <EmptyState
          glyph={Wallet}
          title="Geen uitbetaling voor deze maand"
          action={<ButtonLink to={paths.affiliatePortal("uitbetalingen")} size="sm">Naar uitbetalingen</ButtonLink>}
        >
          In deze maand kwam er niets via je links binnen, of de maand ligt vóór je start in het programma.
        </EmptyState>
      </Page>
    )
  }
  const labels = new Map(book.links.map((l) => [l.id, l.label]))

  return (
    <Page width="wide">
      <PageHead
        title={month.label}
        meta={month.status === "uitbetaald"
          ? `Uitbetaald op ${dayFull(month.payDay)}`
          : `Loopt nog · uitbetaling op ${dayFull(month.payDay)}`}
        actions={
          <Button
            size="sm"
            icon={<Download />}
            onClick={() => {
              downloadStatement(month, name)
              toast({ title: "Overzicht gedownload", body: `northwind-commissie-${month.id}.html` })
            }}
          >
            Overzicht downloaden
          </Button>
        }
      />
      <div className="flex flex-col gap-10">
        <Figures
          label="Deze maand"
          items={[
            { label: "Commissie", value: money(month.gross), note: `${month.rows.length} conversies` },
            {
              label: "Teruggedraaid",
              value: month.reversed === 0 ? "—" : `− ${money(month.reversed)}`,
              note: "na een retour"
            },
            { label: "Uitbetaling", value: money(month.total) },
            {
              label: month.status === "uitbetaald" ? "Betaald op" : "Betaald op, verwacht",
              value: dayLong(month.payDay)
            }
          ]}
        />
        <PageSection id="bestellingen" title="Bestellingen" meta={`${month.rows.length}`}>
          <Table label={`Bestellingen ${month.label}`} minWidth={760}>
            <THead>
              <Th>Bestelling</Th>
              <Th>Dag</Th>
              <Th>Artikel</Th>
              <Th>Via</Th>
              <Th align="right">Bedrag</Th>
              <Th align="right">Commissie</Th>
              <Th>Status</Th>
            </THead>
            <TBody>
              {month.rows.map((c) => (
                <Tr key={c.id}>
                  <Td figure align="left">#{c.order}</Td>
                  <Td figure align="left" muted>{day(c.at)}</Td>
                  <Td header>{c.title}</Td>
                  <Td muted>
                    {c.linkId === null ?
                      "Kortingscode" :
                      (
                        <Link to={paths.affiliatePortal(`doorverwijzingen/${c.linkId}`)} className="hover:text-ink">
                          {labels.get(c.linkId) ?? "Link"}
                        </Link>
                      )}
                  </Td>
                  <Td figure align="right">{money(c.total)}</Td>
                  <Td
                    figure
                    align="right"
                    className={cx("font-medium", c.status === "teruggedraaid" && "text-ink-3 line-through")}
                  >
                    {money(c.commission)}
                  </Td>
                  <Td>
                    <Status tone={CONVERSION_STATUS[c.status].tone}>{CONVERSION_STATUS[c.status].label}</Status>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </PageSection>
      </div>
    </Page>
  )
}
