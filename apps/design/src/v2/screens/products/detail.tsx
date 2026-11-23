import { useState } from "react"
import {
  changesOf,
  CHECK_KIND,
  CHECK_STATUS,
  COMPLAINT_THRESHOLD,
  daysLeft,
  decimal,
  findProduct,
  marginOf,
  percent,
  PHASE,
  qualityOf,
  RETURN_REASONS,
  STATUS,
  STOCK,
  useProductState,
  variantsOf
} from "../../fixtures/products.ts"
import type { ProductRow } from "../../fixtures/products.ts"
import { customer, euro, ORDER_STATUS, productOrders, supplier, when } from "../../fixtures/records.ts"
import type { ProductStatus } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import {
  Archive,
  ClipboardCheck,
  Edit,
  MessageSquare,
  MoreHorizontal,
  Package,
  Play,
  Returns
} from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { dataState, useView } from "../../view.ts"
import type { View } from "../../view.ts"
import { CheckDialog, withUndo } from "./dialogs.tsx"
import { Figures, PageError, RecordSkeleton, Side } from "./parts.tsx"

type Tab = "overzicht" | "kwaliteit"

/**
 * One product (`/app/products/$productId`): how it sells and comes back, by size; stock against its
 * pace; price, cost and margin (edited in place); the supplier; and on the second tab the quality
 * record (phase, complaint rate against the 5% line, the checks the supplier answered, the complaints).
 */
export function ProductDetail({ id }: { readonly id: string }) {
  const view = useView()
  const s = useProductState()
  const access = useAccess("products")
  const state = dataState(view)
  const tab: Tab = useQuery("tab") === "kwaliteit" ? "kwaliteit" : "overzicht"
  const [checkOpen, setCheckOpen] = useState(false)
  const row = findProduct(id, view, s)

  if (!access.view) {
    return (
      <Page width="record">
        <PageHead title="Product" />
        <Denied area="products" what="dit product" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        <RecordSkeleton label="Product laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <PageError title="Dit product kwam niet binnen" detail={`GET /products/${id} · 504 · shopify-sync`}>
          De synchronisatie met Shopify liep vast. Het product zelf staat gewoon in je winkel.
        </PageError>
      </Page>
    )
  }
  if (row === undefined || state === "empty") {
    return (
      <Page width="record">
        <EmptyState
          glyph={Package}
          title="Dit product staat niet in je catalogus"
          action={<ButtonLink to={paths.products}>Naar alle producten</ButtonLink>}
        >
          Het is verwijderd in Shopify of nog niet gesynchroniseerd.
        </EmptyState>
      </Page>
    )
  }

  const quality = qualityOf(row, s)
  const days = daysLeft(row)
  const setStatus = (status: ProductStatus) =>
    withUndo(`${row.name} op ${STATUS[status].label.toLowerCase()} gezet`, undefined, (st) => ({
      ...st,
      edits: { ...st.edits, [row.id]: { ...st.edits[row.id], status } }
    }))

  return (
    <Page width="record">
      <PageHead
        title={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>{row.name}</span>
            <Status tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Status>
          </span>
        }
        meta={
          <>
            {row.sku} · {row.sizes.length === 1 ? "één maat" : `maten ${row.sizes.join(", ")}`} · van{" "}
            <Link to={paths.supplier(row.supplierId)} className="text-ink-2 hover:text-ink hover:underline">
              {row.supplierName}
            </Link>
          </>
        }
        actions={access.edit
          ? (
            <>
              <Button icon={<ClipboardCheck />} onClick={() => setCheckOpen(true)}>Controle aanvragen</Button>
              <DropdownMenu
                label="Meer acties"
                placement="bottom-end"
                trigger={(props) => (
                  <IconButton {...props} label="Meer acties" tone="outline">
                    <MoreHorizontal />
                  </IconButton>
                )}
              >
                {row.status !== "actief" && (
                  <DropdownItem glyph={Play} onSelect={() => setStatus("actief")}>Op actief zetten</DropdownItem>
                )}
                {row.status !== "concept" && (
                  <DropdownItem glyph={Edit} onSelect={() => setStatus("concept")}>Op concept zetten</DropdownItem>
                )}
                {row.status !== "gearchiveerd" && (
                  <DropdownItem
                    glyph={Archive}
                    tone="danger"
                    onSelect={() => setStatus("gearchiveerd")}
                  >
                    Archiveren
                  </DropdownItem>
                )}
              </DropdownMenu>
            </>
          )
          : undefined}
      />
      {!access.edit && <ReadOnlyNotice area="products" />}
      <Tabs
        label="Productweergave"
        value={tab}
        onChange={(next) => setQuery({ tab: next === "overzicht" ? null : next })}
        tabs={[
          { value: "overzicht", label: "Overzicht" },
          { value: "kwaliteit", label: "Kwaliteit", count: quality.checks.length + quality.complaints.length }
        ]}
      />

      {tab === "overzicht"
        ? <Overview row={row} days={days} canEdit={access.edit} />
        : <Quality row={row} canEdit={access.edit} onRequest={() => setCheckOpen(true)} />}

      <CheckDialog open={checkOpen} onClose={() => setCheckOpen(false)} product={row} supplierName={row.supplierName} />
    </Page>
  )
}

/* ── overview ──────────────────────────────────────────────────────────────────────────────────── */

function Overview({ row, days, canEdit }: {
  readonly row: ProductRow
  readonly days: number | null
  readonly canEdit: boolean
}) {
  const sup = supplier(row.supplierId)
  const reasons = RETURN_REASONS[row.id] ?? []
  const variants = variantsOf(row)
  const orders = productOrders(row.id).slice(0, 6)
  const changes = changesOf(row)
  const smallest = variants.length > 1
    ? variants.toSorted((a, b) => b.returned / Math.max(1, b.sold) - a.returned / Math.max(1, a.sold))[0]
    : undefined
  const aurora = row.id === "aurora-hooded-fleece"

  return (
    <div className="flex flex-col gap-10">
      {aurora && (
        <Notice
          tone="warn"
          title={`${row.returned} van de ${row.sold} kwamen terug, 21 omdat hij te klein valt`}
          action={<ButtonLink size="sm" to={paths.qualityCheck("qc-301")}>Controle bekijken</ButtonLink>}
        >
          Bijna alles in maat S. Sofía Kim wijzigde de maattabel op 20 nov; bij Allure Fulfillment staat een
          batchcontrole open tot vr 27 nov.
        </Notice>
      )}

      <Figures
        label="Cijfers van deze week"
        items={[
          { label: "Verkocht", note: "16–22 nov", value: row.sold.toLocaleString("nl-NL") },
          {
            label: "Retour",
            note: `${row.returned} stuks`,
            value: row.sold === 0
              ? "—"
              : <span className={row.rate > 0.1 ? "text-bad-ink" : undefined}>{percent(row.rate, 1)}</span>
          },
          {
            label: "Voorraad",
            ...(row.level === "op-voorraad" ? {} : { note: STOCK[row.level].label.toLowerCase() }),
            value: row.stock.toLocaleString("nl-NL")
          },
          { label: "Dagen voorraad", value: days === null ? "—" : decimal(days, 0) },
          { label: "Marge", value: percent(row.margin) }
        ]}
      />

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <PageSection
            id="maten"
            title="Per maat"
            meta={smallest !== undefined && smallest.returned > 2
              ? `de meeste retouren in ${smallest.size}`
              : undefined}
          >
            <Table label="Voorraad en retour per maat" minWidth={480}>
              <THead>
                <Th>Maat</Th>
                <Th>SKU</Th>
                <Th align="right">Voorraad</Th>
                <Th align="right">Verkocht</Th>
                <Th align="right">Retour</Th>
              </THead>
              <TBody>
                {variants.map((v) => {
                  const rate = v.sold === 0 ? 0 : v.returned / v.sold
                  return (
                    <Tr key={v.size}>
                      <Td header>{v.size}</Td>
                      <Td muted>{v.sku}</Td>
                      <Td figure align="right" className={v.stock < 40 ? "text-warn-ink" : undefined}>
                        {v.stock.toLocaleString("nl-NL")}
                      </Td>
                      <Td figure align="right">{v.sold.toLocaleString("nl-NL")}</Td>
                      <Td figure align="right" className={rate > 0.1 ? "font-medium text-bad-ink" : undefined}>
                        {v.returned} · {v.sold === 0 ? "—" : percent(rate)}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          </PageSection>

          {reasons.length > 0 && (
            <PageSection id="redenen" title="Waarom het terugkwam" meta={`${row.returned} retouren, 16–22 nov`}>
              <ul className="flex flex-col gap-2.5">
                {reasons.map((r) => {
                  const share = row.returned === 0 ? 0 : r.value / row.returned
                  return (
                    <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-4 gap-y-1">
                      <span className="text-sm text-ink">{r.label}</span>
                      <span className="figure text-right text-sm text-ink">{r.value}</span>
                      <span aria-hidden="true" className="col-span-2 h-1 overflow-hidden rounded-full bg-well">
                        <span
                          className="block h-full rounded-full bg-ink-3"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </span>
                    </li>
                  )
                })}
              </ul>
            </PageSection>
          )}

          <PageSection
            id="bestellingen"
            title="Recente bestellingen"
            actions={
              <Link
                to={`${paths.orders}?product=${row.id}`}
                className="text-xs text-ink-3 hover:text-ink hover:underline"
              >
                Alle bestellingen
              </Link>
            }
          >
            {orders.length === 0
              ? <p className="text-sm text-ink-3">Deze week geen bestellingen met dit product.</p>
              : (
                <Table label="Recente bestellingen met dit product" minWidth={480}>
                  <THead>
                    <Th>Bestelling</Th>
                    <Th>Klant</Th>
                    <Th>Status</Th>
                    <Th align="right">Maat</Th>
                  </THead>
                  <TBody>
                    {orders.map((o) => (
                      <Tr key={o.number} onOpen={() => navigate(paths.order(o.number))}>
                        <Td header figure>
                          <Link to={paths.order(o.number)} className="hover:underline">#{o.number}</Link>
                          <span className="ml-2 text-xs text-ink-3">{when(o.placedAt)}</span>
                        </Td>
                        <Td muted className="max-w-[12rem] truncate">{customer(o.customerId)?.name ?? "—"}</Td>
                        <Td>
                          <Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>
                        </Td>
                        <Td align="right" muted>
                          {o.lines.filter((l) => l.productId === row.id).map((l) => l.size).join(", ")}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
          </PageSection>

          <PageSection id="wijzigingen" title="Wijzigingen">
            <Timeline
              label="Wijzigingen aan dit product"
              items={changes.map((c, i) => ({
                id: String(i),
                at: c.at,
                mark: <Avatar name={PEOPLE[c.who].name} size={24} />,
                title: (
                  <>
                    <Link to={paths.person(PEOPLE[c.who].id)} className="font-medium hover:underline">
                      {PEOPLE[c.who].name}
                    </Link>{" "}
                    {c.what}
                  </>
                )
              }))}
            />
          </PageSection>
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Pricing row={row} canEdit={canEdit} />
          <Side id="leverancier" title="Leverancier">
            <KeyValue
              items={[
                {
                  label: "Naam",
                  value: <Link to={paths.supplier(row.supplierId)} className="hover:underline">{row.supplierName}</Link>
                },
                ...(sup === undefined
                  ? []
                  : [
                    {
                      label: "Levertijd",
                      value: (
                        <span className={sup.leadDays > sup.promiseDays ? "text-warn-ink" : undefined}>
                          {decimal(sup.leadDays)} van {sup.promiseDays} dagen
                        </span>
                      ),
                      figure: true
                    },
                    { label: "Land", value: sup.country }
                  ])
              ]}
            />
          </Side>
        </aside>
      </div>
    </div>
  )
}

const n = (v: string) => Number(v.replace(",", "."))

/** Price and cost, edited in place: the margin follows as you type, the save can be undone. */
function Pricing({ row, canEdit }: { readonly row: ProductRow; readonly canEdit: boolean }) {
  const [price, setPrice] = useState(String(row.price))
  const [cost, setCost] = useState(String(row.cost))
  const p = n(price)
  const c = n(cost)
  const valid = Number.isFinite(p) && Number.isFinite(c) && p > 0 && c >= 0
  const dirty = valid && (p !== row.price || c !== row.cost)
  const margin = valid ? marginOf(p, c) : row.margin

  if (!canEdit) {
    return (
      <Side id="prijs" title="Prijs en marge">
        <KeyValue
          items={[
            { label: "Prijs", value: euro(row.price), figure: true },
            { label: "Inkoop", value: euro(row.cost), figure: true },
            { label: "Marge", value: percent(row.margin), figure: true }
          ]}
        />
      </Side>
    )
  }
  return (
    <Side id="prijs" title="Prijs en marge">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!dirty) return
          withUndo(`Prijs van ${row.name} bijgewerkt`, `${euro(p)}, ${percent(marginOf(p, c))} marge.`, (st) => ({
            ...st,
            edits: { ...st.edits, [row.id]: { ...st.edits[row.id], price: p, cost: c } }
          }))
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prijs">
            {(control) => (
              <Input
                {...control}
                prefix="€"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            )}
          </Field>
          <Field label="Inkoop">
            {(control) => (
              <Input
                {...control}
                prefix="€"
                inputMode="decimal"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            )}
          </Field>
        </div>
        <p className="text-xs text-ink-3">
          Marge{" "}
          <span className={`figure text-sm ${margin < 0.5 ? "text-warn-ink" : "text-ink"}`}>{percent(margin)}</span>
          {valid && <>· {euro(Math.round((p - c) * 100) / 100)} per stuk</>}
        </p>
        {dirty && (
          <div className="flex gap-2">
            <Button type="submit" variant="primary" size="sm">Opslaan</Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setPrice(String(row.price))
                setCost(String(row.cost))
              }}
            >
              Annuleren
            </Button>
          </div>
        )}
      </form>
    </Side>
  )
}

/* ── quality ───────────────────────────────────────────────────────────────────────────────────── */

function Quality({ row, canEdit, onRequest }: {
  readonly row: ProductRow
  readonly canEdit: boolean
  readonly onRequest: () => void
}) {
  const s = useProductState()
  const q = qualityOf(row, s)
  const watched = q.phase === "toezicht"

  return (
    <div className="flex flex-col gap-10">
      {q.over && (
        <Notice tone="bad" title={`${percent(q.rate, 1)} klachten, boven de grens van ${percent(COMPLAINT_THRESHOLD)}`}>
          {q.complaints.length} klachten op {q.sold90} verkocht in 90 dagen.{" "}
          {watched ? "Het product staat onder toezicht." : "Overweeg het onder toezicht te zetten."}
        </Notice>
      )}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <Figures
          label="Kwaliteit, laatste 90 dagen"
          items={[
            { label: "Fase", value: <Status tone={PHASE[q.phase].tone}>{PHASE[q.phase].label}</Status> },
            { label: "Klachten", value: q.complaints.length },
            {
              label: "Klachtpercentage",
              note: `grens ${percent(COMPLAINT_THRESHOLD)}`,
              value: <span className={q.over ? "text-bad-ink" : undefined}>{percent(q.rate, 1)}</span>
            },
            { label: "Verkocht", note: "90 dagen", value: q.sold90.toLocaleString("nl-NL") }
          ]}
        />
        {canEdit && (
          <label className="flex items-center gap-3 text-sm text-ink">
            Onder toezicht
            <Toggle
              label="Onder toezicht"
              on={watched}
              onChange={(on) =>
                withUndo(
                  on ? `${row.name} staat onder toezicht` : `${row.name} niet meer onder toezicht`,
                  on ? "Elke nieuwe klacht komt bij jou binnen, en nieuwe batches vragen een controle." : undefined,
                  (st) => ({ ...st, edits: { ...st.edits, [row.id]: { ...st.edits[row.id], watch: on } } })
                )}
            />
          </label>
        )}
      </div>

      <PageSection
        id="controles"
        title="Controles"
        meta={q.checks.length === 0 ? undefined : String(q.checks.length)}
        actions={canEdit
          ? <Button size="sm" icon={<ClipboardCheck />} onClick={onRequest}>Controle aanvragen</Button>
          : undefined}
      >
        {q.checks.length === 0
          ? (
            <p className="text-sm text-ink-3">
              Nog geen controles. Vraag {row.supplierName} om foto's van een batch, een monster of een testbestelling.
            </p>
          )
          : (
            <Table label="Controles bij de leverancier" minWidth={620}>
              <THead>
                <Th>Controle</Th>
                <Th>Maten</Th>
                <Th>Status</Th>
                <Th>Aangevraagd</Th>
                <Th align="right">Uiterlijk</Th>
              </THead>
              <TBody>
                {q.checks.map((c) => (
                  <Tr key={c.id} onOpen={() => navigate(paths.qualityCheck(c.id))}>
                    <Td header className="py-1.5">
                      <span className="flex min-w-0 flex-col">
                        <Link to={paths.qualityCheck(c.id)} className="font-medium hover:underline">
                          {CHECK_KIND[c.kind]}
                        </Link>
                        <span className="max-w-[20rem] truncate text-2xs text-ink-3">{c.verdict ?? c.note}</span>
                      </span>
                    </Td>
                    <Td muted>{c.sizes.length === 0 ? "alle" : c.sizes.join(", ")}</Td>
                    <Td>
                      <Status tone={c.late === true ? "bad" : CHECK_STATUS[c.status].tone}>
                        {c.late === true ? "Te laat" : CHECK_STATUS[c.status].label}
                      </Status>
                    </Td>
                    <Td muted>{c.requestedAt} · {c.requestedBy.split(" ")[0]}</Td>
                    <Td align="right" muted className="figure whitespace-nowrap">{c.due}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
      </PageSection>

      <PageSection
        id="klachten"
        title="Klachten"
        meta={q.complaints.length === 0 ? undefined : String(q.complaints.length)}
      >
        {q.complaints.length === 0
          ? <p className="text-sm text-ink-3">Geen klachten over de kwaliteit in de laatste 90 dagen.</p>
          : (
            <List label="Klachten over dit product">
              {q.complaints.map((k) => (
                <ListRow
                  key={k.id}
                  padded={false}
                  href={paths.customer(k.customerId)}
                  lead={<GlyphTile size={30}>{k.from === "retour" ? <Returns /> : <MessageSquare />}</GlyphTile>}
                  title={k.text}
                  meta={`${k.customer} · maat ${k.size} · ${k.from === "retour" ? "bij een retour" : "in een bericht"}`}
                  trail={<span className="figure text-xs text-ink-3">{k.at}</span>}
                />
              ))}
            </List>
          )}
      </PageSection>
    </div>
  )
}

/** The product, its supplier and who last changed it, for the werkdraad. */
export function threadParts(id: string, view: View) {
  const p = findProduct(id, view)
  if (p === undefined) return undefined
  const last = changesOf(p)[0]
  return {
    product: p,
    supplier: supplier(p.supplierId),
    last: last === undefined ? undefined : { ...last, person: PEOPLE[last.who] }
  }
}
