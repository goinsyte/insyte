import { useMemo, useState } from "react"
import { LineChart } from "../../charts/line-chart.tsx"
import {
  CONVERSION_STATUS,
  DESTINATIONS,
  linkSlug,
  linkUrl,
  MEDIUM_LABEL,
  PRIYA,
  weeksOf
} from "../../fixtures/affiliate-portal.ts"
import type { LinkTotals, Medium, ReferralLink } from "../../fixtures/affiliate-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { SelectionAction, SelectionBar } from "../../ui/filters.tsx"
import { Copy, Download, LinkIcon, Plus, Trash } from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select } from "../../ui/input.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Pagination } from "../../ui/pagination.tsx"
import { downloadQr, QrCode } from "../../ui/qr.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import {
  day,
  dayFull,
  Figures,
  FiguresSkeleton,
  LoadError,
  money,
  pct,
  TableSkeleton,
  useBook,
  useDataState
} from "./parts.tsx"
import { changeWithUndo, getAffiliate } from "./store.ts"

const ratio = (t: LinkTotals) => (t.link.clicks === 0 ? 0 : (t.conversions / t.link.clicks) * 100)

function copyLink(link: ReferralLink) {
  void navigator.clipboard?.writeText(`https://${link.url}`).catch(() => undefined)
  toast({ title: "Link gekopieerd", body: link.url })
}

type SortKey = "label" | "clicks" | "conversions" | "ratio" | "revenue" | "commission" | "since"

const SORTERS: Readonly<Record<SortKey, (t: LinkTotals) => number | string>> = {
  label: (t) => t.link.label.toLowerCase(),
  clicks: (t) => t.link.clicks,
  conversions: (t) => t.conversions,
  ratio,
  revenue: (t) => t.revenue,
  commission: (t) => t.commission,
  since: (t) => t.link.createdAt.getTime()
}

/*
 * Every link the affiliate shares, with what it did. A new one is made here, tagged so the brand sees
 * where the click came from, and opens on its own page with the orders it brought in.
 */
export function ReferralsPage() {
  const state = useDataState()
  const book = useBook()
  const making = useQuery("nieuw") === "1"
  const [query, setQueryText] = useState("")
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "revenue", dir: "desc" })
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())

  const totals = state === "empty" ? [] : book.totals
  const clicks = totals.reduce((n, t) => n + t.link.clicks, 0)
  const conversions = totals.reduce((n, t) => n + t.conversions, 0)
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = totals.filter((t) => q === "" || `${t.link.label} ${t.link.url}`.toLowerCase().includes(q))
    const by = SORTERS[sort.key]
    return hit.toSorted((a, b) => {
      const x = by(a)
      const y = by(b)
      const c = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : Number(x) - Number(y)
      return sort.dir === "asc" ? c : -c
    })
  }, [totals, query, sort])

  const head = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <Th
      align={align}
      sort={sort.key === key ? sort.dir : null}
      onSort={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
    >
      {label}
    </Th>
  )
  const chosen = rows.filter((t) => picked.has(t.link.id))
  const toggle = (id: string, on: boolean) =>
    setPicked((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <Page width="wide">
      <PageHead
        title="Doorverwijzingen"
        meta={state === "ready" && clicks > 0
          ? `${clicks.toLocaleString("nl-NL")} klikken · ${pct((conversions / clicks) * 100)} wordt een bestelling`
          : "Je links en wat ze opleverden"}
        actions={
          <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setQuery({ nieuw: "1" })}>
            Nieuwe link
          </Button>
        }
      />
      {state === "loading" ?
        <TableSkeleton label="Links laden" /> :
        state === "error" ?
        <LoadError what="Je links" /> :
        totals.length === 0 ?
        (
          <EmptyState
            glyph={LinkIcon}
            title="Nog geen links"
            action={<Button variant="primary" size="sm" onClick={() => setQuery({ nieuw: "1" })}>Link maken</Button>}
          >
            Maak een link voor elke plek waar je Northwind deelt, zodat je ziet wat elke video, post of nieuwsbrief
            oplevert. Je code <span className="figure">{PRIYA.code}</span> werkt ook zonder link.
          </EmptyState>
        ) :
        (
          <div className="flex min-w-0 flex-col gap-3">
            {chosen.length > 0 ?
              (
                <SelectionBar count={chosen.length} noun={["link", "links"]} onClear={() => setPicked(new Set())}>
                  <SelectionAction
                    icon={<Copy />}
                    onClick={() => {
                      const [one] = chosen
                      if (one !== undefined) copyLink(one.link)
                    }}
                  >
                    Link kopiëren
                  </SelectionAction>
                  <SelectionAction
                    icon={<Download />}
                    onClick={() => {
                      for (const t of chosen) downloadQr(`https://${t.link.url}`, t.link.id)
                      toast({
                        title: chosen.length === 1 ? "QR-code gedownload" : `${chosen.length} QR-codes gedownload`
                      })
                    }}
                  >
                    QR-code downloaden
                  </SelectionAction>
                </SelectionBar>
              ) :
              (
                <SearchField
                  value={query}
                  onChange={setQueryText}
                  label="Zoek een link"
                  placeholder="Zoek een link"
                  className="sm:max-w-xs"
                />
              )}
            <Table label="Links" minWidth={820}>
              <THead>
                <Th width={32}>
                  <RowCheckbox
                    label="Alle links kiezen"
                    checked={chosen.length > 0 && chosen.length === rows.length}
                    indeterminate={chosen.length > 0 && chosen.length < rows.length}
                    onChange={(on) => setPicked(on ? new Set(rows.map((t) => t.link.id)) : new Set())}
                  />
                </Th>
                {head("label", "Link", "left")}
                {head("clicks", "Klikken")}
                {head("conversions", "Conversies")}
                {head("ratio", "Ratio")}
                {head("revenue", "Omzet")}
                {head("commission", "Commissie")}
                {head("since", "Sinds")}
                <Th width={40}>
                  <span className="sr-only">Kopiëren</span>
                </Th>
              </THead>
              <TBody>
                {rows.map((t) => (
                  <Tr
                    key={t.link.id}
                    selected={picked.has(t.link.id)}
                    onOpen={() => navigate(paths.affiliatePortal(`doorverwijzingen/${t.link.id}`))}
                  >
                    <Td>
                      <RowCheckbox
                        label={`${t.link.label} kiezen`}
                        checked={picked.has(t.link.id)}
                        onChange={(on) => toggle(t.link.id, on)}
                      />
                    </Td>
                    <Td header>
                      <Link
                        to={paths.affiliatePortal(`doorverwijzingen/${t.link.id}`)}
                        className="flex max-w-[28rem] min-w-0 flex-col py-1.5 hover:text-accent-ink"
                      >
                        <span className="truncate font-medium">{t.link.label}</span>
                        <span className="truncate text-xs text-ink-3">{t.link.url}</span>
                      </Link>
                    </Td>
                    <Td figure align="right">{t.link.clicks.toLocaleString("nl-NL")}</Td>
                    <Td figure align="right">{t.conversions.toLocaleString("nl-NL")}</Td>
                    <Td figure align="right" muted>{pct(ratio(t))}</Td>
                    <Td figure align="right">{money(t.revenue)}</Td>
                    <Td figure align="right" className="font-medium">{money(t.commission)}</Td>
                    <Td figure align="right" muted>{day(t.link.createdAt)}</Td>
                    <Td align="right">
                      <IconButton size="sm" label={`${t.link.label} kopiëren`} onClick={() => copyLink(t.link)}>
                        <Copy />
                      </IconButton>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            {rows.length === 0 && (
              <EmptyState size="sm" title="Geen link gevonden">
                Niets past bij ‘{query}’. Zoek op een deel van de naam of het adres.
              </EmptyState>
            )}
          </div>
        )}
      <NewLinkDialog open={making} onClose={() => setQuery({ nieuw: null })} />
    </Page>
  )
}

/**
 * A new link: what it is for, where it lands, and how it is tagged so the brand's analytics see where
 * the click came from. The finished address and its QR code show before it is made.
 */
function NewLinkDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [label, setLabel] = useState("")
  const [dest, setDest] = useState("home")
  const [medium, setMedium] = useState<Medium>("social")
  const url = linkUrl(dest, medium, label, PRIYA.code)
  const close = () => {
    setLabel("")
    setDest("home")
    setMedium("social")
    onClose()
  }
  const make = () => {
    const name = label.trim()
    if (name === "") return
    const id = `${linkSlug(name).slice(0, 40) || "link"}-${getAffiliate().made.length + 1}`
    const link: ReferralLink = { id, label: name, url, clicks: 0, createdAt: DEMO_NOW.date, target: 0 }
    changeWithUndo(`Link ‘${name}’ gemaakt`, (s) => ({ ...s, made: [link, ...s.made] }))
    close()
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Nieuwe link"
      description="Elke klik en elke bestelling via deze link komt op jouw naam."
      footer={
        <>
          <Button onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={label.trim() === ""} onClick={make}>Link maken</Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          make()
        }}
      >
        <Field label="Waar gebruik je hem">
          {(c) => (
            <Input
              {...c}
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Bijvoorbeeld: TikTok-video winterjassen"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Komt uit op">
            {(c) => (
              <Select {...c} value={dest} onChange={(e) => setDest(e.target.value)}>
                {DESTINATIONS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Kanaal">
            {(c) => (
              <Select {...c} value={medium} onChange={(e) => setMedium(e.target.value as Medium)}>
                {(Object.keys(MEDIUM_LABEL) as Array<Medium>).map((m) => (
                  <option key={m} value={m}>{MEDIUM_LABEL[m]}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex items-center gap-4 rounded-md bg-well p-3">
          <QrCode text={`https://${url}`} size={88} />
          <p className="min-w-0 text-xs break-all text-ink-2">https://{url}</p>
        </div>
      </form>
    </Dialog>
  )
}

/*
 * One link: its address and QR code to share, what it did week by week, and every order that came in
 * through it. A link made in this visit can be removed; the others are the record.
 */
export function ReferralPage({ id }: { readonly id: string }) {
  const state = useDataState()
  const book = useBook()
  const [page, setPage] = useState(1)
  const totals = book.totals.find((t) => t.link.id === id)

  if (state === "loading") {
    return (
      <Page width="wide" label="Link">
        <div aria-busy="true" className="flex flex-col gap-8">
          <FiguresSkeleton />
          <TableSkeleton label="Bestellingen laden" />
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="wide" label="Link">
        <LoadError what="Deze link" />
      </Page>
    )
  }
  if (totals === undefined || state === "empty") {
    return (
      <Page width="text" label="Link niet gevonden">
        <EmptyState
          glyph={LinkIcon}
          title="Deze link bestaat niet (meer)"
          action={<ButtonLink to={paths.affiliatePortal("doorverwijzingen")} size="sm">Naar je links</ButtonLink>}
        >
          Hij is verwijderd, of hij hoort bij een ander account. Je eigen links staan onder Doorverwijzingen.
        </EmptyState>
      </Page>
    )
  }

  const { link } = totals
  const url = `https://${link.url}`
  const own = book.own.has(link.id)
  const rows = book.conversions.filter((c) => c.linkId === link.id)
  const weeks = weeksOf(book, link.id)
  const PAGE = 10

  return (
    <Page width="wide">
      <PageHead
        title={link.label}
        meta={`Sinds ${dayFull(link.createdAt)}`}
        actions={
          <>
            {own && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash />}
                onClick={() => {
                  changeWithUndo(`Link ‘${link.label}’ verwijderd`, (s) => ({
                    ...s,
                    made: s.made.filter((l) => l.id !== link.id)
                  }))
                  navigate(paths.affiliatePortal("doorverwijzingen"))
                }}
              >
                Verwijderen
              </Button>
            )}
            <Button variant="primary" size="sm" icon={<Copy />} onClick={() => copyLink(link)}>Link kopiëren</Button>
          </>
        }
      />
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <Figures
            label="Wat deze link deed"
            items={[
              { label: "Klikken", value: link.clicks.toLocaleString("nl-NL") },
              { label: "Conversies", value: totals.conversions.toLocaleString("nl-NL") },
              { label: "Ratio", value: pct(ratio(totals)) },
              { label: "Commissie", value: money(totals.commission) }
            ]}
          />
          <PageSection id="per-week" title="Per week" meta="Conversies, acht weken">
            <LineChart
              height={190}
              data={{ labels: weeks.map((w) => w.label), current: weeks.map((w) => w.conversions), format: "count" }}
            />
          </PageSection>
          <PageSection id="bestellingen" title="Bestellingen via deze link" meta={`${rows.length}`}>
            {rows.length === 0 ?
              (
                <EmptyState size="sm" title="Nog geen bestellingen">
                  Deel de link en de eerste verschijnt hier, met je commissie erbij.
                </EmptyState>
              ) :
              (
                <>
                  <Table label="Bestellingen via deze link" minWidth={640}>
                    <THead>
                      <Th>Datum</Th>
                      <Th>Bestelling</Th>
                      <Th>Artikel</Th>
                      <Th align="right">Bedrag</Th>
                      <Th align="right">Commissie</Th>
                      <Th>Status</Th>
                    </THead>
                    <TBody>
                      {rows.slice((page - 1) * PAGE, page * PAGE).map((c) => (
                        <Tr key={c.id}>
                          <Td figure align="left" muted>{day(c.at)}</Td>
                          <Td figure align="left">#{c.order}</Td>
                          <Td header>{c.title}</Td>
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
                  {rows.length > PAGE && (
                    <Pagination page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
                  )}
                </>
              )}
          </PageSection>
        </div>
        <aside aria-labelledby="delen" className="flex flex-col gap-3">
          <h2 id="delen" className="text-md font-semibold text-ink">Delen</h2>
          <QrCode text={url} size={176} />
          <p className="text-xs break-all text-ink-2">{url}</p>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download />}
            className="self-start"
            onClick={() => {
              downloadQr(url, link.id)
              toast({ title: "QR-code gedownload", body: `qr-${link.id}.svg` })
            }}
          >
            QR-code downloaden
          </Button>
        </aside>
      </div>
    </Page>
  )
}
