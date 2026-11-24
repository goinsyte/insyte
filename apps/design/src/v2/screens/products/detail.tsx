import { useState } from "react"
import {
  changesOf,
  daysLeft,
  decimal,
  findProduct,
  marginOf,
  percent,
  photosOf,
  qualityOf,
  RETURN_REASONS,
  setProductState,
  silhouetteOf,
  STATUS,
  STOCK,
  SUPPLIER_MEDIA,
  useProductState,
  variantsOf
} from "../../fixtures/products.ts"
import type { CheckKind, ProductRow } from "../../fixtures/products.ts"
import { customer, euro, ORDER_STATUS, productOrders, supplier, SUPPLIERS, when } from "../../fixtures/records.ts"
import type { ProductStatus } from "../../fixtures/records.ts"
import { FEED, findSupplier } from "../../fixtures/suppliers.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { RecordLabel, Status, Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Archive,
  Check,
  ClipboardCheck,
  Edit,
  ExternalLink,
  ImageOff,
  MoreHorizontal,
  Package,
  Paperclip,
  Play,
  RefreshCcw
} from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import type { View } from "../../view.ts"
import { UnsavedBar } from "../settings/parts.tsx"
import { CheckDialog, withUndo } from "./dialogs.tsx"
import { Figures, InlineText, PageError, ProductArt, RecordSkeleton, Side } from "./parts.tsx"
import { QualityTab } from "./quality.tsx"

type Tab = "overzicht" | "kwaliteit"

/** Shopify's admin for a product: the record of truth for media, variants and SEO. */
const shopifyUrl = (row: ProductRow) => `https://northwind-eu.myshopify.com/admin/products?query=${row.sku}`

/**
 * One product (`/app/products/$productId`): how it sells and comes back, by size; stock against its
 * pace; and everything the operator edits where it is read (title, photos, description, price and
 * cost, status, supplier, labels), held as a draft until the bar at the foot saves it with Undo.
 * Shopify stays the record: the next sync takes the new values there, and the page opens it for
 * what Insyte does not edit. The second tab is the quality record (`quality.tsx`).
 */
export function ProductDetail({ id }: { readonly id: string }) {
  const view = useView()
  const s = useProductState()
  const access = useAccess("products")
  const state = dataState(view)
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
  return <ProductRecord key={row.id} row={row} canEdit={access.edit} />
}

/* ── the draft ─────────────────────────────────────────────────────────────────────────────────── */

type Draft = {
  readonly name: string
  readonly description: string
  readonly price: string
  readonly cost: string
  readonly status: ProductStatus
  readonly supplierId: string
  readonly tags: ReadonlyArray<string>
}

const draftOf = (r: ProductRow): Draft => ({
  name: r.name,
  description: r.description,
  price: String(r.price).replace(".", ","),
  cost: String(r.cost).replace(".", ","),
  status: r.status,
  supplierId: r.supplierId,
  tags: r.tags
})

const amount = (v: string) => Number(v.trim().replace(",", "."))

/** What changed, in a few words, for the bar and the toast. */
function changed(a: Draft, b: Draft): ReadonlyArray<string> {
  const out: Array<string> = []
  if (a.name !== b.name) out.push("titel")
  if (a.description !== b.description) out.push("beschrijving")
  if (a.price !== b.price || a.cost !== b.cost) out.push("prijs")
  if (a.status !== b.status) out.push("status")
  if (a.supplierId !== b.supplierId) out.push("leverancier")
  if (a.tags.join() !== b.tags.join()) out.push("labels")
  return out
}

function ProductRecord({ row, canEdit }: { readonly row: ProductRow; readonly canEdit: boolean }) {
  const s = useProductState()
  const tab: Tab = useQuery("tab") === "kwaliteit" ? "kwaliteit" : "overzicht"
  const [check, setCheck] = useState<CheckKind | null>(null)
  const [sync, setSync] = useState<"idle" | "busy" | "done">("idle")
  const saved = draftOf(row)
  const savedKey = JSON.stringify(saved)
  // The draft follows the saved values: a save, an undo or another tab's change starts it again.
  const [held, setHeld] = useState<{ readonly key: string; readonly draft: Draft }>({ key: savedKey, draft: saved })
  const draft = held.key === savedKey ? held.draft : saved
  const set = (patch: Partial<Draft>) => setHeld({ key: savedKey, draft: { ...draft, ...patch } })
  const diff = changed(saved, draft)
  const price = amount(draft.price)
  const cost = amount(draft.cost)
  const valid = Number.isFinite(price) && Number.isFinite(cost) && price > 0 && cost >= 0 && draft.name.trim() !== ""
  const quality = qualityOf(row, s)
  const days = daysLeft(row)
  const statusTone = STATUS[draft.status]

  const save = () => {
    if (!valid) {
      toast({ title: "Niet opgeslagen", body: "Een product heeft een titel en een prijs boven € 0.", tone: "bad" })
      return
    }
    withUndo(
      `${
        diff.length === 1 ? (diff[0] ?? "") : diff.slice(0, -1).join(", ") + " en " + (diff.at(-1) ?? "")
      } van ${draft.name.trim()} opgeslagen`.replace(/^./, (c) => c.toUpperCase()),
      "Shopify neemt de nieuwe waarden over bij de volgende synchronisatie.",
      (st) => ({
        ...st,
        edits: {
          ...st.edits,
          [row.id]: {
            ...st.edits[row.id],
            name: draft.name.trim(),
            description: draft.description,
            price,
            cost,
            status: draft.status,
            supplierId: draft.supplierId,
            tags: draft.tags
          }
        }
      })
    )
  }
  const setStatus = (status: ProductStatus) =>
    withUndo(`${row.name} op ${STATUS[status].label.toLowerCase()} gezet`, undefined, (st) => ({
      ...st,
      edits: { ...st.edits, [row.id]: { ...st.edits[row.id], status } }
    }))
  const syncNow = () => {
    setSync("busy")
    window.setTimeout(() => {
      setSync("done")
      setProductState((st) => ({ ...st, synced: { ...st.synced, [row.id]: "zojuist" } }))
      toast({
        title: `${row.name} gesynchroniseerd vanuit Shopify`,
        body: "Titel, varianten, prijs en voorraad staan gelijk met Northwind EU.",
        tone: "good"
      })
    }, 900)
  }
  const lastSync = s.synced[row.id] ?? "vandaag 14:02"

  return (
    <Page width="record">
      <PageHead
        title={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <InlineText value={draft.name} onChange={(name) => set({ name })} label="Titel" readOnly={!canEdit} />
            <Status tone={statusTone.tone}>{statusTone.label}</Status>
          </span>
        }
        meta={
          <>
            {row.sku} · {row.category} · {row.sizes.length === 1 ? "één maat" : `maten ${row.sizes.join(", ")}`} · van
            {" "}
            <Link to={paths.supplier(row.supplierId)} className="text-ink-2 hover:text-ink hover:underline">
              {row.supplierName}
            </Link>
            {` · gesynchroniseerd ${lastSync}`}
          </>
        }
        actions={
          <>
            {canEdit && (
              <Button
                variant="ghost"
                loading={sync === "busy"}
                icon={sync === "done" ? <Check /> : <RefreshCcw />}
                onClick={syncNow}
              >
                {sync === "busy" ? "Synchroniseren" : sync === "done" ? "Zojuist gesynchroniseerd" : "Synchroniseren"}
              </Button>
            )}
            {canEdit && <Button icon={<ClipboardCheck />} onClick={() => setCheck("batch")}>Controle aanvragen</Button>}
            <DropdownMenu
              label="Meer acties"
              placement="bottom-end"
              trigger={(props) => (
                <IconButton {...props} label="Meer acties" tone="outline">
                  <MoreHorizontal />
                </IconButton>
              )}
            >
              <DropdownItem glyph={ExternalLink} onSelect={() => window.open(shopifyUrl(row), "_blank", "noopener")}>
                Openen in Shopify
              </DropdownItem>
              {canEdit && <DropdownSeparator />}
              {canEdit && row.status !== "actief" && (
                <DropdownItem glyph={Play} onSelect={() => setStatus("actief")}>Op actief zetten</DropdownItem>
              )}
              {canEdit && row.status !== "concept" && (
                <DropdownItem glyph={Edit} onSelect={() => setStatus("concept")}>Op concept zetten</DropdownItem>
              )}
              {canEdit && row.status !== "gearchiveerd" && (
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
        }
      />
      {!canEdit && <ReadOnlyNotice area="products" />}
      <Tabs
        label="Productweergave"
        value={tab}
        onChange={(next) => setQuery({ tab: next === "overzicht" ? null : next, controle: null })}
        tabs={[
          { value: "overzicht", label: "Overzicht" },
          {
            value: "kwaliteit",
            label: quality.phase === "toezicht" ? "Kwaliteit · onder toezicht" : "Kwaliteit",
            count: quality.checks.length + quality.complaints.length
          }
        ]}
      />

      {tab === "overzicht"
        ? <Overview row={row} days={days} canEdit={canEdit} draft={draft} set={set} />
        : <QualityTab row={row} canEdit={canEdit} onRequest={setCheck} />}

      {canEdit && (
        <UnsavedBar
          dirty={diff.length > 0}
          note={diff.join(", ")}
          onReset={() => setHeld({ key: savedKey, draft: saved })}
          onSave={save}
        />
      )}
      <CheckDialog
        open={check !== null}
        onClose={() => setCheck(null)}
        product={row}
        supplierName={row.supplierName}
        initialKind={check ?? "batch"}
      />
    </Page>
  )
}

/* ── overview ──────────────────────────────────────────────────────────────────────────────────── */

function Overview({ row, days, canEdit, draft, set }: {
  readonly row: ProductRow
  readonly days: number | null
  readonly canEdit: boolean
  readonly draft: Draft
  readonly set: (patch: Partial<Draft>) => void
}) {
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
      {row.adsPaused && (
        <Notice
          tone="warn"
          title="Advertenties staan op pauze"
          action={canEdit
            ? (
              <Button
                size="sm"
                onClick={() =>
                  withUndo(
                    `Advertenties voor ${row.name} hervat`,
                    "Meta stuurt weer kopers naar het product.",
                    (st) => ({ ...st, edits: { ...st.edits, [row.id]: { ...st.edits[row.id], adsPaused: false } } })
                  )}
              >
                Advertenties hervatten
              </Button>
            )
            : undefined}
        >
          De advertenties voor {row.name} staan op pauze tot het weer op voorraad is.
        </Notice>
      )}
      {aurora && (
        <Notice
          tone="warn"
          title={`${row.returned} van de ${row.sold} kwamen terug, 21 omdat hij te klein valt`}
          action={
            <ButtonLink size="sm" to={`${paths.product(row.id)}?tab=kwaliteit&controle=qc-301`}>
              Controle bekijken
            </ButtonLink>
          }
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
          <Gallery row={row} />

          <PageSection id="beschrijving" title="Beschrijving">
            <InlineText
              value={draft.description}
              onChange={(description) => set({ description })}
              label="Beschrijving"
              multiline
              readOnly={!canEdit}
              placeholder="Nog geen beschrijving. Klik om er een te schrijven."
              className="block max-w-[68ch] text-sm leading-relaxed whitespace-pre-line text-ink-2"
            />
          </PageSection>

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
                        {v.stock === 0 ? "Op" : v.stock.toLocaleString("nl-NL")}
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
          <Pricing row={row} canEdit={canEdit} draft={draft} set={set} />
          <Delivery row={row} canEdit={canEdit} draft={draft} set={set} />
          <Labels canEdit={canEdit} tags={draft.tags} onChange={(tags) => set({ tags })} />
        </aside>
      </div>
    </div>
  )
}

/**
 * The product's photographs: the one picked, large, with the rest as a strip under it. Shopify holds
 * the media, so a product without any says where to add them.
 */
function Gallery({ row }: { readonly row: ProductRow }) {
  const photos = photosOf(row.id)
  const [index, setIndex] = useState(0)
  const at = Math.min(index, Math.max(0, photos.length - 1))
  const shape = silhouetteOf(row.id)
  return (
    <PageSection
      id="fotos"
      title="Foto's"
      meta={photos.length === 0 ? undefined : `${photos.length} uit Shopify`}
      actions={
        <a
          href={shopifyUrl(row)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink hover:underline"
        >
          Beheren in Shopify
          <ExternalLink size={12} />
        </a>
      }
    >
      {photos.length === 0
        ? (
          <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 rounded-md bg-well text-sm text-ink-3">
            <ImageOff size={20} />
            Nog geen foto's. Voeg ze toe in Shopify; ze komen bij de volgende synchronisatie binnen.
          </div>
        )
        : (
          <div className="flex flex-col gap-2">
            <figure className="flex flex-col gap-1.5">
              <span className="flex aspect-[16/9] items-center justify-center rounded-md bg-well">
                <ProductArt shape={shape} view={at} className="h-4/5" />
              </span>
              <figcaption className="text-xs text-ink-3">
                {photos[at]} · {at + 1} van {photos.length}
              </figcaption>
            </figure>
            {photos.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Foto's van het product">
                {photos.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Foto ${i + 1} van ${photos.length}: ${label}`}
                    aria-pressed={i === at}
                    className={cx(
                      "flex size-14 items-center justify-center rounded-sm bg-well transition-opacity",
                      i === at ? "ring-2 ring-accent" : "opacity-70 hover:opacity-100"
                    )}
                  >
                    <ProductArt shape={shape} view={i} className="size-10" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
    </PageSection>
  )
}

/** Price and cost in the draft: the margin follows as you type; the bar at the foot saves it. */
function Pricing({ row, canEdit, draft, set }: {
  readonly row: ProductRow
  readonly canEdit: boolean
  readonly draft: Draft
  readonly set: (patch: Partial<Draft>) => void
}) {
  const p = amount(draft.price)
  const c = amount(draft.cost)
  const valid = Number.isFinite(p) && Number.isFinite(c) && p > 0 && c >= 0
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
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prijs" error={Number.isFinite(p) && p > 0 ? undefined : "Boven € 0"}>
            {(control) => (
              <Input
                {...control}
                prefix="€"
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
              />
            )}
          </Field>
          <Field label="Inkoop">
            {(control) => (
              <Input
                {...control}
                prefix="€"
                inputMode="decimal"
                value={draft.cost}
                onChange={(e) => set({ cost: e.target.value })}
              />
            )}
          </Field>
        </div>
        <p className="text-xs text-ink-3">
          Marge{" "}
          <span className={`figure text-sm ${margin < 0.5 ? "text-warn-ink" : "text-ink"}`}>{percent(margin)}</span>
          {valid && <>· {euro(Math.round((p - c) * 100) / 100)} per stuk</>}
        </p>
      </div>
    </Side>
  )
}

/** Status and who supplies it, in the draft; and what the supplier says about delivery and stock. */
function Delivery({ row, canEdit, draft, set }: {
  readonly row: ProductRow
  readonly canEdit: boolean
  readonly draft: Draft
  readonly set: (patch: Partial<Draft>) => void
}) {
  const view = useView()
  const sup = supplier(draft.supplierId)
  const terms = findSupplier(draft.supplierId, view)
  const media = SUPPLIER_MEDIA[row.id] ?? []
  return (
    <Side id="levering" title="Status en levering">
      <div className="flex flex-col gap-3">
        {canEdit && (
          <>
            <Field label="Status">
              {(control) => (
                <Select
                  {...control}
                  value={draft.status}
                  onChange={(e) => set({ status: e.target.value as ProductStatus })}
                >
                  {(Object.keys(STATUS) as ReadonlyArray<ProductStatus>).map((k) => (
                    <option key={k} value={k}>{STATUS[k].label}</option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Leverancier">
              {(control) => (
                <Select
                  {...control}
                  value={draft.supplierId}
                  onChange={(e) => set({ supplierId: e.target.value })}
                >
                  {SUPPLIERS.filter((x) => x.status !== "uitgenodigd" || x.id === draft.supplierId).map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        <KeyValue
          items={[
            ...(canEdit
              ? []
              : [{
                label: "Leverancier",
                value: <Link to={paths.supplier(row.supplierId)} className="hover:underline">{row.supplierName}</Link>
              }]),
            {
              label: "Voorraad",
              value: (
                <span
                  className={row.level === "op" ? "text-bad-ink" : row.level === "laag" ? "text-warn-ink" : undefined}
                >
                  {STOCK[row.level].label}
                </span>
              )
            },
            ...(sup === undefined || sup.leadDays === 0
              ? []
              : [{
                label: "Levertijd",
                value: (
                  <span className={sup.leadDays > sup.promiseDays ? "text-warn-ink" : undefined}>
                    {decimal(sup.leadDays)} van {sup.promiseDays} dagen
                  </span>
                ),
                figure: true
              }]),
            ...(terms === undefined ? [] : [{ label: "Voorraadfeed", value: FEED[terms.feed] }])
          ]}
        />
        {media.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-ink-3">
              Van {row.supplierName} · {media.length === 1 ? "1 bestand" : `${media.length} bestanden`}
            </span>
            <ul className="flex flex-col gap-1">
              {media.map((m) => (
                <li key={m.name} className="flex min-w-0 items-center gap-2 text-sm">
                  <Paperclip size={14} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-ink">{m.name}</span>
                  <span className="figure shrink-0 text-xs text-ink-3">{m.size} · {m.at}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Side>
  )
}

/** The product's labels, as Shopify tags: removed with their cross, added by typing one and Enter. */
function Labels({ canEdit, tags, onChange }: {
  readonly canEdit: boolean
  readonly tags: ReadonlyArray<string>
  readonly onChange: (next: ReadonlyArray<string>) => void
}) {
  const [text, setText] = useState("")
  const add = () => {
    const t = text.trim().toLowerCase()
    if (t !== "" && !tags.includes(t)) onChange([...tags, t])
    setText("")
  }
  if (!canEdit && tags.length === 0) return null
  return (
    <Side id="labels" title="Labels">
      <div className="flex flex-col gap-2">
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {tags.map((t) =>
              canEdit
                ? <RecordLabel key={t} onRemove={() => onChange(tags.filter((x) => x !== t))}>{t}</RecordLabel>
                : <Tag key={t}>{t}</Tag>
            )}
          </span>
        )}
        {canEdit && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input
              aria-label="Label toevoegen"
              placeholder="Label toevoegen"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </form>
        )}
        {canEdit && <p className="text-xs text-ink-3">Labels gaan als tags naar Shopify.</p>}
      </div>
    </Side>
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
