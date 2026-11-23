import { useState } from "react"
import {
  absorbedInto,
  casesOf,
  counted,
  COUNTRY,
  findCustomer,
  getCustomerState,
  isOpen,
  notesOf,
  ordersOf,
  SEGMENT,
  setCustomerState,
  useCustomerState
} from "../../fixtures/customers.ts"
import type { CustomerRow } from "../../fixtures/customers.ts"
import { CUSTOMERS, euro, ORDER_STATUS, product, when } from "../../fixtures/records.ts"
import { ME, PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { RecordLabel, Status, Tag } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  ChevronRight,
  CreditCard,
  Download,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Returns,
  Ticket,
  Trash,
  UserX
} from "../../ui/icons.tsx"
import { Input, Textarea } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Skeleton, SkeletonRow } from "../../ui/skeleton.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { EraseDialog, ExportDialog } from "./dialogs.tsx"
import { Figures, PageError, Side } from "./parts.tsx"

const SHOWN = 8

/**
 * One customer (`/app/customers/$customerId`): what they are worth, what is open with them (a ticket,
 * a return, a chargeback, each by its id and who has it), their orders, the team's notes, labels,
 * and the two privacy requests a customer can make. Merged profiles say where they went; an erased
 * profile keeps its amounts and dates and nothing else.
 */
export function CustomerDetail({ id }: { readonly id: string }) {
  const view = useView()
  const s = useCustomerState()
  const access = useAccess("customers")
  const support = useAccess("support")
  const state = dataState(view)
  const [dialog, setDialog] = useState<"export" | "erase" | null>(null)
  const row = findCustomer(id, view, s)

  if (!access.view) {
    return (
      <Page width="record">
        <PageHead title="Klant" />
        <Denied area="customers" what="dit klantprofiel" />
      </Page>
    )
  }
  if (state === "loading") return <DetailSkeleton />
  if (state === "error") {
    return (
      <Page width="record">
        <PageError title="Dit profiel kwam niet binnen" detail={`GET /customers/${id} · 503`}>
          Shopify antwoordde niet op tijd. De bestellingen van deze klant staan ook onder Bestellingen.
        </PageError>
      </Page>
    )
  }
  if (row === undefined || state === "empty") {
    return (
      <Page width="record">
        <EmptyState
          glyph={UserX}
          title="Deze klant staat niet in je winkel"
          action={<ButtonLink to={paths.customers}>Naar alle klanten</ButtonLink>}
        >
          Het profiel is verwijderd, samengevoegd of nooit gesynchroniseerd. Zoek op naam of e-mail in de klantenlijst.
        </EmptyState>
      </Page>
    )
  }

  const mergedInto = s.merged[row.id]
  const into = mergedInto === undefined ? undefined : CUSTOMERS.find((c) => c.id === mergedInto)
  const absorbed = absorbedInto(row.id, s)
  const orders = ordersOf(row.id, s)
  const cases = casesOf(row.id)
  const returns = orders.filter((o) => o.status === "retour" || o.status === "terugbetaald").slice(0, 4)
  const first = row.name.split(" ")[0] ?? row.name

  const newTicket = () =>
    toast({
      title: `Ticket geopend voor ${row.name}`,
      body: `‘Opvolgen met ${row.name}’, prioriteit gemiddeld.`,
      tone: "good",
      action: { label: "Openen", onClick: () => navigate(paths.tickets) }
    })

  return (
    <Page width="record">
      <PageHead
        title={
          <span className="inline-flex items-center gap-2.5">
            <span aria-hidden="true" className="inline-flex">
              <Avatar name={row.name} size={30} />
            </span>
            {row.name}
          </span>
        }
        after={<Status tone={SEGMENT[row.segment].tone}>{SEGMENT[row.segment].label}</Status>}
        meta={row.erased
          ? `Klant sinds ${row.since} · persoonsgegevens gewist`
          : `${row.email} · ${row.city}, ${COUNTRY[row.country]} · klant sinds ${row.since}`}
        actions={
          <>
            {!row.erased && (
              <Button
                icon={<Mail />}
                onClick={() => toast({ title: "Je mailprogramma opent", body: `Een nieuwe mail aan ${row.email}.` })}
              >
                E-mailen
              </Button>
            )}
            {support.edit && !row.erased && (
              <Button variant="primary" icon={<MessageSquare />} onClick={newTicket}>Nieuw ticket</Button>
            )}
            <DropdownMenu
              label="Meer acties"
              placement="bottom-end"
              trigger={(props) => (
                <IconButton label="Meer acties" tone="outline" {...props}>
                  <MoreHorizontal />
                </IconButton>
              )}
            >
              <DropdownItem glyph={Download} onSelect={() => setDialog("export")} disabled={row.erased}>
                Inzage geven (AVG)
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                glyph={Trash}
                tone="danger"
                disabled={!access.manage || row.erased}
                hint={access.manage ? undefined : "Beheerder"}
                onSelect={() => setDialog("erase")}
              >
                Gegevens wissen
              </DropdownItem>
            </DropdownMenu>
          </>
        }
      />

      {!access.edit && <ReadOnlyNotice area="customers" />}
      {into !== undefined && (
        <Notice
          title={`Samengevoegd met ${into.name}`}
          action={<ButtonLink size="sm" to={paths.customer(into.id)}>Naar {into.name}</ButtonLink>}
        >
          De bestellingen van dit profiel tellen nu daar mee.
        </Notice>
      )}
      {absorbed.length > 0 && (
        <Notice title={`${absorbed.length + 1} profielen samengevoegd tot dit profiel`}>
          Hun bestellingen en waarde tellen hier mee. Ook bewaard: {absorbed.map((c) => c.email).join(", ")}.
        </Notice>
      )}
      {row.erased && (
        <Notice tone="warn" title="Persoonsgegevens gewist">
          Naam, adres, telefoon en e-mails zijn weg, ook in Shopify en Klaviyo. Bedragen en datums blijven voor je
          cijfers.
        </Notice>
      )}

      <Figures
        label="Cijfers van deze klant"
        items={[
          { label: "Klantwaarde", value: euro(row.value) },
          { label: "Bestellingen", value: row.orders.toLocaleString("nl-NL") },
          { label: "Gem. bestelling", value: row.orders === 0 ? "—" : euro(Math.round(row.aov)) },
          { label: "Laatste bestelling", value: row.lastOrder === undefined ? "—" : when(row.lastOrder.placedAt) }
        ]}
      />

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <PageSection
            id="open"
            title="Tickets en retouren"
            meta={cases.length + returns.length === 0 ? undefined : String(cases.length + returns.length)}
          >
            {cases.length + returns.length === 0
              ? <p className="text-sm text-ink-3">Geen tickets, retouren of geschillen.</p>
              : (
                <List label="Tickets en retouren">
                  {cases.map((c) => (
                    <ListRow
                      key={c.id}
                      padded={false}
                      href={c.kind === "ticket" ? paths.ticket(c.id) : paths.chargeback(c.id)}
                      lead={
                        <GlyphTile size={30}>
                          {c.kind === "ticket" ? <Ticket size={15} /> : <CreditCard size={15} />}
                        </GlyphTile>
                      }
                      title={
                        <>
                          <span className="figure text-ink-3">{c.kind === "ticket" ? `#${c.id}` : c.id}</span> {c.title}
                        </>
                      }
                      meta={`${c.detail}${c.assignee === null ? "" : ` · ${PEOPLE[c.assignee].name}`}`}
                      trail={<Status tone={c.tone}>{c.status}</Status>}
                    />
                  ))}
                  {returns.map((o) => (
                    <ListRow
                      key={o.number}
                      padded={false}
                      href={paths.order(o.number)}
                      lead={
                        <GlyphTile size={30}>
                          <Returns size={15} />
                        </GlyphTile>
                      }
                      title={
                        <>
                          <span className="figure text-ink-3">#{o.number}</span>{" "}
                          {o.lines.map((l) => `${product(l.productId)?.name ?? l.productId} (${l.size})`).join(", ")}
                        </>
                      }
                      meta={`${ORDER_STATUS[o.status].label} · ${when(o.placedAt)}${
                        o.tags.includes("maat") ? " · om de maat" : ""
                      }`}
                      trail={<Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>}
                    />
                  ))}
                </List>
              )}
          </PageSection>

          <PageSection
            id="bestellingen"
            title="Bestellingen"
            meta={orders.length === 0 ? undefined : `${Math.min(SHOWN, orders.length)} van ${orders.length}`}
            actions={orders.length > SHOWN
              ? (
                <Link
                  to={`${paths.orders}?klant=${row.id}`}
                  className="flex min-h-8 items-center gap-0.5 text-xs text-ink-3 hover:text-ink pointer-coarse:min-h-11"
                >
                  Alle bestellingen
                  <ChevronRight size={13} />
                </Link>
              )
              : undefined}
          >
            {orders.length === 0
              ? (
                <p className="text-sm text-ink-3">
                  Nog geen bestellingen. Zodra {first} bestelt, verschijnt de bestelling hier.
                </p>
              )
              : (
                <Table label={`Bestellingen van ${row.name}`} minWidth={560}>
                  <THead>
                    <Th>Bestelling</Th>
                    <Th>Producten</Th>
                    <Th>Status</Th>
                    <Th align="right">Totaal</Th>
                  </THead>
                  <TBody>
                    {orders.slice(0, SHOWN).map((o) => (
                      <Tr
                        key={o.number}
                        onOpen={() => navigate(paths.order(o.number))}
                      >
                        <Td header figure>
                          <Link to={paths.order(o.number)} className="hover:underline">#{o.number}</Link>
                          <span className="ml-2 text-xs font-normal text-ink-3">{when(o.placedAt)}</span>
                        </Td>
                        <Td muted className="max-w-[16rem] truncate">
                          {o.lines.map((l) => product(l.productId)?.name ?? l.productId).join(", ")}
                        </Td>
                        <Td>
                          <Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>
                        </Td>
                        <Td figure align="right">{euro(o.total)}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
          </PageSection>

          <Notes row={row} canEdit={access.edit} />
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Side id="contact" title="Contact">
            <KeyValue
              items={[
                { label: "E-mail", value: row.email },
                { label: "Stad", value: row.city },
                { label: "Land", value: COUNTRY[row.country] },
                ...absorbed.map((c) => ({ label: "Ook", value: c.email })),
                ...(s.klaviyo[row.id] === undefined ? [] : [{ label: "Klaviyo", value: `Lijst ${s.klaviyo[row.id]}` }]),
                { label: "Klant-ID", value: row.id, figure: true }
              ]}
            />
          </Side>
          <Labels row={row} canEdit={access.edit && !row.erased} />
          <Side id="privacy" title="Privacy">
            <p className="text-xs text-pretty text-ink-3">
              Een klant mag inzage vragen in wat je bewaart, of vragen dat je het wist. Je hebt een maand om te
              antwoorden.
            </p>
            <div className="flex flex-col items-start gap-1">
              <Button
                size="sm"
                variant="ghost"
                icon={<Download />}
                disabled={row.erased}
                onClick={() => setDialog("export")}
              >
                Inzage geven
              </Button>
              {access.manage
                ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash />}
                    disabled={row.erased}
                    onClick={() => setDialog("erase")}
                  >
                    Gegevens wissen
                  </Button>
                )
                : <Denied area="customers" need={3} size="inline" className="pt-1 text-xs" />}
            </div>
          </Side>
        </aside>
      </div>

      <ExportDialog open={dialog === "export"} onClose={() => setDialog(null)} row={row} />
      <EraseDialog open={dialog === "erase"} onClose={() => setDialog(null)} row={row} />
    </Page>
  )
}

function Notes({ row, canEdit }: { readonly row: CustomerRow; readonly canEdit: boolean }) {
  const s = useCustomerState()
  const [draft, setDraft] = useState("")
  const notes = notesOf(row.id, s)
  const save = () => {
    const text = draft.trim()
    if (text === "") return
    const before = getCustomerState()
    setCustomerState((st) => ({
      ...st,
      notes: {
        ...st.notes,
        [row.id]: [{ id: `n-${Date.now()}`, by: ME.name, at: "zojuist", text }, ...(st.notes[row.id] ?? [])]
      }
    }))
    setDraft("")
    toast({
      title: "Notitie opgeslagen",
      body: "Alleen je team ziet notities; de klant niet.",
      action: { label: "Ongedaan maken", onClick: () => setCustomerState(() => before) }
    })
  }
  return (
    <PageSection id="notities" title="Notities" meta={notes.length === 0 ? undefined : String(notes.length)}>
      {canEdit && (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={`Notitie over ${row.name}`}
            placeholder="Wat moet het team weten over deze klant?"
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={draft.trim() === ""} onClick={save}>Notitie opslaan</Button>
          </div>
        </div>
      )}
      {notes.length === 0
        ? <p className="text-sm text-ink-3">Nog geen notities. Alleen je team ziet ze.</p>
        : (
          <ol className="flex flex-col gap-4">
            {notes.map((n) => (
              <li key={n.id} className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
                <Avatar name={n.by} size={24} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="text-xs text-ink-3">
                    <span className="font-medium text-ink-2">{n.by}</span> · <span className="figure">{n.at}</span>
                  </p>
                  <p className="text-sm text-pretty text-ink">{n.text}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
    </PageSection>
  )
}

function Labels({ row, canEdit }: { readonly row: CustomerRow; readonly canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const set = (tags: ReadonlyArray<string>, title: string) => {
    const before = getCustomerState()
    setCustomerState((st) => ({ ...st, tags: { ...st.tags, [row.id]: tags } }))
    toast({ title, action: { label: "Ongedaan maken", onClick: () => setCustomerState(() => before) } })
  }
  const add = () => {
    const t = draft.trim().toLowerCase()
    setDraft("")
    setAdding(false)
    if (t === "" || row.tags.includes(t)) return
    set([...row.tags, t], `Label ‘${t}’ toegevoegd`)
  }
  return (
    <Side
      id="labels"
      title="Labels"
      action={canEdit && !adding
        ? (
          <IconButton label="Label toevoegen" size="sm" onClick={() => setAdding(true)}>
            <Plus />
          </IconButton>
        )
        : undefined}
    >
      {row.tags.length === 0 && !adding && <p className="text-sm text-ink-3">Nog geen labels.</p>}
      {row.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.tags.map((t) => (
            <RecordLabel
              key={t}
              {...(canEdit ? { onRemove: () => set(row.tags.filter((x) => x !== t), `Label ‘${t}’ weggehaald`) } : {})}
            >
              {t}
            </RecordLabel>
          ))}
        </div>
      )}
      {adding && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <Input
            autoFocus
            aria-label="Nieuw label"
            placeholder="Bijvoorbeeld vip"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false)
            }}
          />
          <Button size="sm" type="submit">Erbij</Button>
        </form>
      )}
      {row.segment === "dubbel" && (
        <p className="pt-1 text-xs text-ink-3">
          <Tag>Dubbel</Tag> Dit profiel lijkt op een ander. Bekijk het bij{" "}
          <Link
            to={`${paths.customers}?samenvoegen=1`}
            className="text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            de dubbele profielen
          </Link>
          .
        </p>
      )}
    </Side>
  )
}

function DetailSkeleton() {
  return (
    <Page width="record">
      <div aria-busy="true" aria-label="Klant laden" className="flex flex-col gap-10">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
        <div className="flex flex-wrap gap-10">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div className="flex flex-col">
            {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)}
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-3" />)}
          </div>
        </div>
      </div>
    </Page>
  )
}

/** The first open order and ticket of a profile, for the werkdraad. */
export function threadParts(id: string) {
  const s = getCustomerState()
  const orders = ordersOf(id, s)
  const latest = orders[0]
  const openOrder = orders.find(isOpen)
  const ticket = casesOf(id)[0]
  return { latest, openOrder, ticket, count: counted(orders.length, "bestelling", "bestellingen") }
}
