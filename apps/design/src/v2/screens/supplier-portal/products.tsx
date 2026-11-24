import { useState } from "react"
import {
  AURORA_SIZES,
  auroraComplaints,
  BRAND,
  CHECKS,
  MODE_LABEL,
  STOCK_LABEL,
  stockLevel
} from "../../fixtures/supplier-portal.ts"
import type { StockMode } from "../../fixtures/supplier-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import { Download, Minus, Package, Plus } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import {
  count,
  day,
  Handoff,
  LoadError,
  money,
  plural,
  saveFile,
  TableSkeleton,
  time,
  useDataState,
  weekday
} from "./parts.tsx"
import { changeWithUndo, useOrders, useProducts, useSupplier } from "./store.ts"

/*
 * What Allure supplies to Northwind: stock per product, what open orders already claim, and the lead
 * time Northwind promises customers from. Stock is the one thing a supplier updates often.
 */
export function ProductsPage() {
  const state = useDataState()
  const products = useProducts()
  const orders = useOrders()
  const rows = state === "empty" ? [] : products
  const claimed = (id: string) =>
    orders
      .filter((o) => o.status === "te-accepteren" || o.status === "te-verzenden" || o.status === "probleem")
      .reduce((n, o) => n + o.lines.filter((l) => l.productId === id).reduce((m, l) => m + l.quantity, 0), 0)

  const exportStock = () => {
    const csv = [
      "sku,product,maat,voorraad",
      ...rows.flatMap((p) => p.variants.map((v) => `${v.sku},"${p.name}",${v.size},${v.stock}`))
    ].join("\n")
    saveFile("allure-voorraad.csv", csv, "text/csv")
    toast({ title: "Voorraad geëxporteerd", body: "allure-voorraad.csv" })
  }

  return (
    <Page width="wide">
      <PageHead
        title="Producten"
        meta={state === "ready"
          ? `${plural(rows.length, "product", "producten")} die ${BRAND} bij je afneemt`
          : `Wat je aan ${BRAND} levert`}
        actions={
          <Button size="sm" icon={<Download />} disabled={rows.length === 0} onClick={exportStock}>
            Voorraad exporteren
          </Button>
        }
      />
      {state === "loading" ?
        <TableSkeleton rows={5} label="Producten laden" /> :
        state === "error" ?
        <LoadError what="Je producten" /> :
        rows.length === 0 ?
        (
          <EmptyState glyph={Package} title="Nog geen producten">
            {BRAND} heeft nog geen producten aan je gekoppeld. Zodra dat gebeurt, zet je hier voorraad en levertijd.
          </EmptyState>
        ) :
        (
          <Table label="Producten" minWidth={720}>
            <THead>
              <Th>Product</Th>
              <Th>Voorraad</Th>
              <Th align="right">In open bestellingen</Th>
              <Th align="right">Levertijd</Th>
              <Th>Voorraad melden</Th>
            </THead>
            <TBody>
              {rows.map((p) => {
                const units = p.variants.reduce((n, v) => n + v.stock, 0)
                const level = stockLevel(units, p.variants.map((v) => v.stock))
                const out = p.variants.filter((v) => v.stock === 0).map((v) => v.size)
                return (
                  <Tr key={p.id} onOpen={() => navigate(paths.supplierPortal(`producten/${p.id}`))}>
                    <Td header>
                      <Link
                        to={paths.supplierPortal(`producten/${p.id}`)}
                        className="flex flex-col py-1.5 hover:text-accent-ink"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-ink-3">{p.variants.map((v) => v.size).join(", ")}</span>
                      </Link>
                    </Td>
                    <Td>
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-baseline gap-2">
                          <span className="figure text-ink">{count(units)}</span>
                          <Status tone={STOCK_LABEL[level].tone}>{STOCK_LABEL[level].label}</Status>
                        </span>
                        {out.length > 0 && <span className="text-xs text-bad-ink">{out.join(", ")} uitverkocht</span>}
                      </span>
                    </Td>
                    <Td figure align="right">{count(claimed(p.id))}</Td>
                    <Td figure align="right" muted>{plural(p.lead, "dag", "dagen")}</Td>
                    <Td muted>{MODE_LABEL[p.mode].label}</Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        )}
    </Page>
  )
}

/*
 * One product: stock per size (the steppers save in one go), the lead time, how stock reaches
 * Northwind, what is waiting, and for the Aurora the size table and what customers said about it,
 * with the check Northwind asked for.
 */
export function ProductPage({ id }: { readonly id: string }) {
  const state = useDataState()
  const products = useProducts()
  const orders = useOrders()
  const product = products.find((p) => p.id === id)
  const [draft, setDraft] = useState<Readonly<Record<string, number>>>({})

  if (state === "loading") {
    return (
      <Page width="record" label="Product">
        <TableSkeleton rows={4} label="Product laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record" label="Product">
        <LoadError what="Dit product" />
      </Page>
    )
  }
  if (product === undefined || state === "empty") {
    return (
      <Page width="text" label="Product niet gevonden">
        <EmptyState
          glyph={Package}
          title="Dit is geen product van jou"
          action={<ButtonLink to={paths.supplierPortal("producten")} size="sm">Naar je producten</ButtonLink>}
        >
          Je ziet alleen de producten die {BRAND} bij Allure Fulfillment afneemt.
        </EmptyState>
      </Page>
    )
  }

  const dirty = Object.entries(draft).filter(([vid, n]) => product.variants.find((v) => v.id === vid)?.stock !== n)
  const waiting = orders.filter((o) =>
    (o.status === "te-accepteren" || o.status === "te-verzenden" || o.status === "probleem") &&
    o.lines.some((l) => l.productId === product.id)
  )
  const units = product.variants.reduce((n, v) => n + (draft[v.id] ?? v.stock), 0)
  const save = () => {
    changeWithUndo(
      `Voorraad van ${product.name} bijgewerkt`,
      (s) => ({ ...s, stock: { ...s.stock, ...draft } }),
      `${BRAND} ziet de nieuwe aantallen meteen.`
    )
    setDraft({})
  }
  const aurora = product.id === AURORA_SIZES.productId

  return (
    <Page width="record">
      <PageHead
        title={product.name}
        meta={`${count(units)} op voorraad · ${BRAND} betaalt ${money(product.cost)} per stuk`}
        actions={dirty.length > 0 && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setDraft({})}>Annuleren</Button>
            <Button size="sm" variant="primary" onClick={save}>Opslaan</Button>
          </>
        )}
      />
      <div className="flex flex-col gap-12">
        <PageSection id="voorraad" title="Voorraad per variant">
          <ul className="flex flex-col">
            {product.variants.map((v) => {
              const value = draft[v.id] ?? v.stock
              const set = (n: number) => setDraft((d) => ({ ...d, [v.id]: Math.max(0, n) }))
              return (
                <li key={v.id} className="flex items-center gap-4 border-b border-line py-2.5 last:border-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-ink">Maat {v.size}</span>
                    <span className="text-xs text-ink-3">{v.sku}</span>
                  </span>
                  {value !== v.stock && <span className="figure text-xs text-ink-3">was {v.stock}</span>}
                  {value === 0 && value === v.stock && (
                    <span className="text-xs font-medium text-bad-ink">Uitverkocht</span>
                  )}
                  <span className="flex items-center gap-1">
                    <IconButton
                      label={`Eén minder in maat ${v.size}`}
                      size="sm"
                      className="pointer-coarse:size-11"
                      disabled={value === 0}
                      onClick={() => set(value - 1)}
                    >
                      <Minus />
                    </IconButton>
                    <span className="w-16">
                      <Input
                        aria-label={`Voorraad maat ${v.size}`}
                        inputMode="numeric"
                        value={String(value)}
                        onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
                        className="figure text-right"
                      />
                    </span>
                    <IconButton
                      label={`Eén meer in maat ${v.size}`}
                      size="sm"
                      className="pointer-coarse:size-11"
                      onClick={() => set(value + 1)}
                    >
                      <Plus />
                    </IconButton>
                  </span>
                </li>
              )
            })}
          </ul>
        </PageSection>

        <div className="grid gap-10 sm:grid-cols-2">
          <LeadTime id={product.id} lead={product.lead} />
          <PageSection id="melden" title="Hoe je voorraad meldt">
            <RadioGroup<StockMode>
              label="Hoe je voorraad meldt"
              value={product.mode}
              onChange={(mode) =>
                changeWithUndo(
                  `Voorraad melden: ${MODE_LABEL[mode].label}`,
                  (s) => ({ ...s, mode: { ...s.mode, [product.id]: mode } })
                )}
              options={(Object.keys(MODE_LABEL) as Array<StockMode>).map((m) => ({
                value: m,
                label: MODE_LABEL[m].label,
                description: MODE_LABEL[m].detail
              }))}
            />
          </PageSection>
        </div>

        <PageSection id="wacht" title="Wacht op jou" meta={waiting.length > 0 ? `${waiting.length}` : undefined}>
          {waiting.length === 0 ?
            <p className="text-sm text-ink-3">Geen open bestellingen met dit product.</p> :
            (
              <List label="Wacht op jou">
                {waiting.slice(0, 6).map((o) => {
                  const lines = o.lines.filter((l) => l.productId === product.id)
                  return (
                    <ListRow
                      key={o.number}
                      padded={false}
                      href={paths.supplierPortal(`bestellingen/${o.number}`)}
                      title={<span className="figure">#{o.number}</span>}
                      meta={lines.map((l) => `${l.quantity}× maat ${l.size}`).join(", ")}
                      trail={
                        <span className="text-right text-xs">
                          <Handoff order={o} />
                        </span>
                      }
                    />
                  )
                })}
              </List>
            )}
        </PageSection>

        {aurora && <SizeTable />}
        {aurora && <Complaints />}
        <QualityChecks productId={product.id} />
        <Media name={product.name} />
      </div>
    </Page>
  )
}

function LeadTime({ id, lead }: { readonly id: string; readonly lead: number }) {
  const [value, setValue] = useState(String(lead))
  const n = Number(value)
  const valid = Number.isInteger(n) && n >= 1 && n <= 30
  return (
    <PageSection id="levertijd" title="Levertijd">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || n === lead) return
          changeWithUndo(
            `Levertijd ${plural(n, "dag", "dagen")}`,
            (s) => ({ ...s, lead: { ...s.lead, [id]: n } }),
            `${BRAND} rekent nieuwe leverdata hiermee uit.`
          )
        }}
      >
        <Field
          label="Dagen van bestelling tot overdracht"
          hint={`${BRAND} rekent de leverdatum aan de klant hiermee uit.`}
          {...(valid ? {} : { error: "Tussen 1 en 30 dagen." })}
        >
          {(c) => (
            <span className="flex items-center gap-2">
              <Input
                {...c}
                inputMode="numeric"
                suffix="dagen"
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
                className="w-28"
              />
              <Button size="sm" type="submit" disabled={!valid || n === lead}>Opslaan</Button>
            </span>
          )}
        </Field>
      </form>
    </PageSection>
  )
}

function SizeTable() {
  const t = AURORA_SIZES
  return (
    <PageSection id="maattabel" title="Maattabel" meta={`In cm · ${t.changedBy} wijzigde S en M op ${t.changedAt}`}>
      <Table label="Maattabel Aurora Hooded Fleece" minWidth={420}>
        <THead>
          <Th>Maat</Th>
          {t.columns.map((c) => <Th key={c} align="right">{c}</Th>)}
        </THead>
        <TBody>
          {t.rows.map((r) => (
            <Tr key={r.size}>
              <Td header>{r.size}</Td>
              {r.values.map((v, i) => {
                const was = r.was[i]
                return (
                  <Td key={i} figure align="right">
                    {was !== undefined && was !== v && <span className="mr-2 text-ink-4 line-through">{was}</span>}
                    <span className={cx(was !== v && "font-medium text-ink")}>{v}</span>
                  </Td>
                )
              })}
            </Tr>
          ))}
        </TBody>
      </Table>
      <p className="text-sm text-pretty text-ink-2">
        In de winkel staat erbij: ‘{t.advice}’ Jullie tabel van {t.deliveredAt}{" "}
        gaf voor S en M twee centimeter meer borstomvang. Klopt de nieuwe batch anders, laat het weten in de chat.
      </p>
    </PageSection>
  )
}

function Complaints() {
  const c = auroraComplaints()
  const top = Math.max(...c.reasons.map((r) => r.count))
  return (
    <PageSection id="klachten" title="Wat klanten zeiden" meta={`${c.total} retouren vorige week`}>
      <ul className="flex flex-col gap-2">
        {c.reasons.map((r) => (
          <li
            key={r.label}
            className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
          >
            <span className="truncate text-ink-2">{r.label}</span>
            <span className="h-1.5 rounded-full bg-well" aria-hidden="true">
              <span
                className={cx("block h-full rounded-full", r.count === top ? "bg-ink-2" : "bg-ink-4")}
                style={{ width: `${(r.count / top) * 100}%` }}
              />
            </span>
            <span className="figure text-right text-ink">{r.count}</span>
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-4">
        {c.quotes.map((q) => (
          <li key={q.order} className="flex flex-col gap-1">
            <p className="text-sm text-pretty text-ink">‘{q.text}’</p>
            <p className="text-xs text-ink-3">Maat {q.size} · #{q.order} · {q.when}</p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-ink-3">Namen en contactgegevens blijven bij {BRAND}.</p>
    </PageSection>
  )
}

function QualityChecks({ productId }: { readonly productId: string }) {
  const { checks } = useSupplier()
  const list = CHECKS.filter((c) => c.productId === productId)
  const [files, setFiles] = useState<ReadonlyArray<File>>([])
  const [batch, setBatch] = useState("")
  const [note, setNote] = useState("")
  if (list.length === 0) return null
  return (
    <PageSection id="controles" title="Kwaliteitscontroles">
      <div className="flex flex-col gap-8">
        {list.map((c) => {
          const sent = checks[c.id]
          const open = c.status === "gevraagd" && sent === undefined
          return (
            <article key={c.id} className="flex flex-col gap-4">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold text-ink">{c.kind}</h3>
                <Status tone={open ? "warn" : sent !== undefined ? "accent" : "good"}>
                  {open ? `Vóór ${weekday(c.due)}, ${time(c.due)}` : sent !== undefined ? "Ingestuurd" : "Goedgekeurd"}
                </Status>
              </header>
              <p className="text-sm text-pretty text-ink-2">
                {c.note} <span className="text-ink-3">· {c.requestedBy}, {day(c.requestedAt)}</span>
              </p>
              {open ?
                (
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (files.length === 0 || batch.trim() === "") return
                      changeWithUndo(
                        "Controle ingestuurd",
                        (s) => ({
                          ...s,
                          checks: {
                            ...s.checks,
                            [c.id]: {
                              batch: batch.trim(),
                              note: note.trim(),
                              files: files.map((f) => f.name),
                              at: DEMO_NOW.date
                            }
                          }
                        }),
                        `${BRAND} krijgt een melding en beoordeelt het.`
                      )
                      setFiles([])
                    }}
                  >
                    <p className="text-xs text-ink-3">
                      Aanleveren: {c.deliver.join(" en ").toLowerCase()}
                      {c.sizes.length > 0 ? `, maten ${c.sizes.join(", ")}` : ""}.
                    </p>
                    <FileDrop
                      accept="image/*,video/*"
                      hint="Foto's of video, tot 20 MB per bestand."
                      onFiles={(fs) => setFiles((x) => [...x, ...fs])}
                    />
                    {files.length > 0 && (
                      <ul className="flex flex-col gap-1.5">
                        {files.map((f, i) => (
                          <li key={`${f.name}-${i}`}>
                            <FileRow
                              name={f.name}
                              bytes={f.size}
                              state={{ kind: "done" }}
                              onRemove={() => setFiles((x) => x.filter((_, j) => j !== i))}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
                      <Field label="Batchnummer">
                        {(f) => (
                          <Input
                            {...f}
                            value={batch}
                            onChange={(e) => setBatch(e.target.value)}
                            placeholder="AUR-2611-B"
                          />
                        )}
                      </Field>
                      <Field label="Notitie" optional>
                        {(f) => (
                          <Textarea
                            {...f}
                            rows={1}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Borstomvang S gemeten: 98 cm."
                          />
                        )}
                      </Field>
                    </div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      className="self-start"
                      disabled={files.length === 0 || batch.trim() === ""}
                    >
                      Controle insturen
                    </Button>
                  </form>
                ) :
                (
                  <p className="text-xs text-ink-3">
                    {sent !== undefined
                      ? `Ingestuurd ${day(sent.at)}, ${time(sent.at)}: ${
                        plural(sent.files.length, "bestand", "bestanden")
                      }, batch ${sent.batch}. ${BRAND} beoordeelt het.`
                      : c.verdict}
                  </p>
                )}
            </article>
          )
        })}
      </div>
    </PageSection>
  )
}

function Media({ name }: { readonly name: string }) {
  const [files, setFiles] = useState<ReadonlyArray<File>>([])
  return (
    <PageSection id="media" title={`Foto's en video's voor ${BRAND}`} meta="Voor de productpagina en advertenties">
      <FileDrop
        accept="image/*,video/*"
        hint="JPG, PNG of MP4. Op een effen achtergrond, minstens 2000 pixels breed."
        onFiles={(fs) => {
          setFiles((x) => [...x, ...fs])
          if (fs.length > 0) {
            toast({
              title: `${plural(fs.length, "bestand", "bestanden")} gedeeld met ${BRAND}`,
              body: name
            })
          }
        }}
      />
      {files.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <FileRow
                name={f.name}
                bytes={f.size}
                state={{ kind: "done" }}
                onRemove={() => setFiles((x) => x.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  )
}
