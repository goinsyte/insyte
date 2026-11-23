import { useState } from "react"
import { APPROVALS } from "../../fixtures/home.ts"
import { customer, euro, ORDER_STATUS, product, when } from "../../fixtures/records.ts"
import type { Order } from "../../fixtures/records.ts"
import {
  daysUnderway,
  decimal,
  findSupplier,
  KESTREL_PROPOSAL,
  PORTAL,
  PORTAL_SCOPES,
  useSupplierState,
  VIA
} from "../../fixtures/suppliers.ts"
import type { SupplierRow, Via } from "../../fixtures/suppliers.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { Eye, Factory, Mail, MoreHorizontal, Pause, Play, Send, UserX } from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle, ToggleRow } from "../../ui/toggle.tsx"
import { dataState, useView } from "../../view.ts"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { MailDialog, withUndo } from "./dialogs.tsx"
import { Figures, PageError, RecordSkeleton, Side } from "./parts.tsx"

/**
 * One supplier (the original's supplier dialog, as a page): whether they keep their word (lead time
 * against the promise, share on time), the late orders by days underway, what they make, who the
 * contact is and who on the team follows them up, how orders reach them, and what their portal shows.
 * Kestrel carries the follow-up mail the Leveranciersopvolger drafted, the same proposal Start shows.
 */
export function SupplierDetail({ id }: { readonly id: string }) {
  const view = useView()
  const st = useSupplierState()
  const access = useAccess("suppliers")
  const state = dataState(view)
  const [dialog, setDialog] = useState<"mail" | "revoke" | null>(null)
  const row = findSupplier(id, view, st)

  if (!access.view) {
    return (
      <Page width="record">
        <PageHead title="Leverancier" />
        <Denied area="suppliers" what="deze leverancier" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        <RecordSkeleton label="Leverancier laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <PageError title="Deze leverancier kwam niet binnen" detail={`GET /suppliers/${id} · 502`}>
          De gegevens laadden niet. Bestellingen gaan gewoon door naar deze leverancier.
        </PageError>
      </Page>
    )
  }
  if (row === undefined || state === "empty") {
    return (
      <Page width="record">
        <EmptyState
          glyph={Factory}
          title="Deze leverancier staat niet in je lijst"
          action={<ButtonLink to={paths.suppliers}>Naar alle leveranciers</ButtonLink>}
        >
          De leverancier is verwijderd, of de uitnodiging is ingetrokken.
        </EmptyState>
      </Page>
    )
  }

  const owner = PEOPLE[row.owner]
  const proposal = row.id === "kestrel-goods" ? APPROVALS.find((a) => a.id === KESTREL_PROPOSAL) : undefined
  const late = row.late.toSorted((a, b) => a.placedAt.getTime() - b.placedAt.getTime())
  const invited = row.portal === "uitgenodigd"
  const pause = (paused: boolean) =>
    withUndo(
      paused ? `${row.name} gepauzeerd` : `${row.name} hervat`,
      paused ? "Nieuwe bestellingen wachten tot je ze hervat; wat al onderweg is, gaat door." : undefined,
      (s) => ({ edits: { ...s.edits, [row.id]: { ...s.edits[row.id], paused } } })
    )

  return (
    <Page width="record">
      <PageHead
        title={
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span>{row.name}</span>
            {row.paused
              ? <Status tone="neutral">Gepauzeerd</Status>
              : invited
              ? <Status tone="warn">Uitgenodigd</Status>
              : <Status tone="good">Actief</Status>}
          </span>
        }
        meta={`${row.supplies} · ${row.country} · leverancier sinds ${row.since}`}
        actions={
          <>
            <Button icon={<Mail />} onClick={() => setDialog("mail")}>E-mailen</Button>
            {access.edit && (
              <DropdownMenu
                label="Meer acties"
                placement="bottom-end"
                trigger={(props) => (
                  <IconButton {...props} label="Meer acties" tone="outline">
                    <MoreHorizontal />
                  </IconButton>
                )}
              >
                <DropdownItem glyph={Eye} onSelect={() => navigate(paths.supplierPortal())}>
                  Bekijken zoals zij het zien
                </DropdownItem>
                <DropdownSeparator />
                {row.paused
                  ? <DropdownItem glyph={Play} onSelect={() => pause(false)}>Hervatten</DropdownItem>
                  : <DropdownItem glyph={Pause} onSelect={() => pause(true)}>Pauzeren</DropdownItem>}
              </DropdownMenu>
            )}
          </>
        }
      />
      {!access.edit && <ReadOnlyNotice area="suppliers" />}

      {proposal !== undefined && access.edit && <WaitingProposal item={proposal} primary />}
      {row.paused && (
        <Notice tone="warn" title="Gepauzeerd: nieuwe bestellingen wachten">
          Wat al bij {row.name} ligt, gaat door. Nieuwe regels gaan pas weg als je hervat.
        </Notice>
      )}
      {invited && (
        <Notice
          tone="info"
          title={`Uitgenodigd op ${row.invitedAt ?? "—"}, nog niet geaccepteerd`}
          action={access.edit
            ? (
              <Button
                size="sm"
                icon={<Send />}
                onClick={() =>
                  toast({
                    title: `Uitnodiging opnieuw verstuurd naar ${row.contact}`,
                    body: `${row.email}, 14 dagen geldig.`,
                    tone: "good"
                  })}
              >
                Opnieuw versturen
              </Button>
            )
            : undefined}
        >
          {row.contact} kreeg een link naar het portaal. Zolang die niet geopend is, gaan bestellingen per e-mail.
        </Notice>
      )}

      {!invited && (
        <Figures
          label="Hoe ze leveren"
          items={[
            {
              label: "Levertijd",
              note: `belooft ${row.promiseDays} dagen`,
              value: (
                <span className={row.leadDays > row.promiseDays ? "text-warn-ink" : undefined}>
                  {decimal(row.leadDays)} dagen
                </span>
              )
            },
            {
              label: "Op tijd",
              note: "vorige maand",
              value: row.onTime === null
                ? "—"
                : <span className={row.onTime < 0.8 ? "text-bad-ink" : undefined}>{Math.round(row.onTime * 100)}%</span>
            },
            { label: "Open bestellingen", value: row.open.length },
            {
              label: "Te laat",
              value: <span className={late.length > 0 ? "text-bad-ink" : undefined}>{late.length}</span>
            },
            { label: "Producten", value: row.products.length }
          ]}
        />
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <PageSection
            id="te-laat"
            title="Te laat"
            meta={late.length === 0
              ? undefined
              : `${late.length} bestellingen, langer dan ${row.promiseDays} dagen onderweg`}
          >
            {late.length === 0
              ? <p className="text-sm text-ink-3">Niets te laat. Alles wat open staat, valt binnen de belofte.</p>
              : <OrderTable orders={late} supplierId={row.id} label="Te late bestellingen" showDays />}
          </PageSection>

          <PageSection
            id="open"
            title="Open bestellingen"
            meta={row.open.length === 0 ? undefined : String(row.open.length)}
            actions={row.open.length > 0
              ? (
                <Link
                  to={`${paths.orders}?leverancier=${row.id}`}
                  className="text-xs text-ink-3 hover:text-ink hover:underline"
                >
                  Alle bestellingen
                </Link>
              )
              : undefined}
          >
            {row.open.length === 0
              ? <p className="text-sm text-ink-3">Geen open bestellingen bij {row.name}.</p>
              : (
                <OrderTable
                  orders={row.open.filter((o) => o.status !== "vertraagd").slice(0, 6)}
                  supplierId={row.id}
                  label="Open bestellingen"
                />
              )}
          </PageSection>

          <PageSection
            id="producten"
            title="Producten"
            meta={row.products.length === 0 ? undefined : String(row.products.length)}
          >
            {row.products.length === 0
              ? (
                <p className="text-sm text-ink-3">
                  Nog geen producten gekoppeld. Dat doe je per product, of na het accepteren van de uitnodiging.
                </p>
              )
              : (
                <Table label={`Producten van ${row.name}`} minWidth={440}>
                  <THead>
                    <Th>Product</Th>
                    <Th align="right">Inkoop</Th>
                    <Th align="right">Prijs</Th>
                    <Th align="right">Voorraad</Th>
                  </THead>
                  <TBody>
                    {row.products.map((p) => (
                      <Tr key={p.id} onOpen={() => navigate(paths.product(p.id))}>
                        <Td header>
                          <Link to={paths.product(p.id)} className="hover:underline">{p.name}</Link>
                        </Td>
                        <Td figure align="right" muted>{euro(p.cost)}</Td>
                        <Td figure align="right">{euro(p.price)}</Td>
                        <Td figure align="right" className={p.stock < 40 ? "text-warn-ink" : undefined}>
                          {p.stock.toLocaleString("nl-NL")}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
          </PageSection>

          <Portal row={row} canEdit={access.edit} onRevoke={() => setDialog("revoke")} />
        </div>

        <aside className="flex min-w-0 flex-col gap-8">
          <Side id="contact" title="Contact">
            <KeyValue
              items={[
                { label: "Contactpersoon", value: row.contact },
                { label: "E-mail", value: <span className="break-all">{row.email}</span> },
                ...(row.phone === undefined ? [] : [{ label: "Telefoon", value: row.phone }]),
                {
                  label: "Opvolging",
                  value: <Link to={paths.person(owner.id)} className="hover:underline">{owner.name}</Link>
                }
              ]}
            />
          </Side>
          <Routing row={row} canEdit={access.edit} />
        </aside>
      </div>

      <MailDialog
        open={dialog === "mail"}
        onClose={() => setDialog(null)}
        to={[{ name: row.contact === "—" ? row.name : `${row.contact}, ${row.name}`, email: row.email }]}
        {...(late.length > 0
          ? {
            subject: `${late.length} zendingen langer dan ${row.promiseDays} dagen onderweg`,
            body: `Beste ${
              row.contact.split(" ")[0] ?? row.contact
            },\n\nDeze bestellingen zijn langer onderweg dan afgesproken: ${
              late.map((o) => `#${o.number}`).join(", ")
            }. Kunt u per zending de status en een nieuwe verzenddatum sturen?\n\nMet vriendelijke groet,\nNorthwind`
          }
          : {})}
      />
      <AlertDialog
        open={dialog === "revoke"}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          withUndo(
            `Toegang van ${row.name} ingetrokken`,
            "Hun link werkt niet meer. Bestellingen gaan nu per e-mail.",
            (s) => ({
              edits: {
                ...s.edits,
                [row.id]: { ...s.edits[row.id], portal: "geen", via: row.via === "portaal" ? "email" : row.via }
              }
            })
          )
        }}
        title={`Toegang van ${row.name} intrekken?`}
        body="Hun link naar het portaal werkt direct niet meer. Bestellingen die ze via het portaal kregen, gaan voortaan per e-mail. Je kunt ze later opnieuw uitnodigen."
        confirmLabel="Toegang intrekken"
      />
    </Page>
  )
}

function OrderTable({ orders, supplierId, label, showDays = false }: {
  readonly orders: ReadonlyArray<Order>
  readonly supplierId: string
  readonly label: string
  readonly showDays?: boolean
}) {
  return (
    <Table label={label} minWidth={560}>
      <THead>
        <Th>Bestelling</Th>
        <Th>Klant</Th>
        <Th>Hun regels</Th>
        <Th>{showDays ? "Onderweg" : "Status"}</Th>
      </THead>
      <TBody>
        {orders.map((o) => {
          const lines = o.lines.filter((l) => product(l.productId)?.supplierId === supplierId)
          const days = daysUnderway(o)
          return (
            <Tr key={o.number} onOpen={() => navigate(paths.order(o.number))}>
              <Td header figure className="whitespace-nowrap">
                <Link to={paths.order(o.number)} className="hover:underline">#{o.number}</Link>
                <span className="ml-2 text-xs text-ink-3">{when(o.placedAt)}</span>
              </Td>
              <Td muted className="max-w-[10rem] truncate">{customer(o.customerId)?.name ?? "—"}</Td>
              <Td className="max-w-[16rem] truncate">
                {lines.map((l) => `${product(l.productId)?.name ?? l.productId} (${l.size})`).join(", ")}
              </Td>
              <Td>
                {showDays
                  ? <span className="figure text-bad-ink">{days} dagen</span>
                  : <Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}

/** How orders reach them: the portal, an e-mail per order, or their API; and whether it goes on its own. */
function Routing({ row, canEdit }: { readonly row: SupplierRow; readonly canEdit: boolean }) {
  const options: ReadonlyArray<{ value: Via; label: string }> = [
    { value: "portaal", label: "Portaal" },
    { value: "email", label: "E-mail" },
    ...(row.apiConnected ? [{ value: "api" as const, label: "API" }] : [])
  ]
  if (!canEdit) {
    return (
      <Side id="doorsturen" title="Doorsturen">
        <KeyValue
          items={[
            { label: "Via", value: VIA[row.via] },
            { label: "Automatisch", value: row.auto ? "Ja" : "Nee" }
          ]}
        />
      </Side>
    )
  }
  return (
    <Side id="doorsturen" title="Doorsturen">
      <div className="flex flex-col gap-3">
        <Segmented
          label="Bestellingen gaan via"
          size="sm"
          value={row.via}
          onChange={(via) =>
            withUndo(`Bestellingen voor ${row.name} gaan nu via ${VIA[via].toLowerCase()}`, undefined, (s) => ({
              edits: { ...s.edits, [row.id]: { ...s.edits[row.id], via } }
            }))}
          options={options}
        />
        <label className="flex items-center justify-between gap-3 text-sm text-ink">
          <span className="flex flex-col">
            Automatisch doorsturen
            <span className="text-xs text-ink-3">
              {row.auto ? "Na betaling, zonder te wachten" : "Jij keurt elke bestelling goed"}
            </span>
          </span>
          <Toggle
            label="Automatisch doorsturen"
            on={row.auto}
            onChange={(auto) =>
              withUndo(
                auto ? "Bestellingen gaan automatisch door" : "Je keurt bestellingen eerst goed",
                undefined,
                (s) => ({
                  edits: { ...s.edits, [row.id]: { ...s.edits[row.id], auto } }
                })
              )}
          />
        </label>
        {!row.apiConnected && (
          <p className="text-xs text-ink-3">Een API-koppeling zetten ze zelf op vanuit het portaal.</p>
        )}
      </div>
    </Side>
  )
}

/** The supplier portal: whether they are in, and which parts they see. Customer contact details never go along. */
function Portal({ row, canEdit, onRevoke }: {
  readonly row: SupplierRow
  readonly canEdit: boolean
  readonly onRevoke: () => void
}) {
  const invite = () =>
    withUndo(`Uitnodiging verstuurd naar ${row.contact}`, `${row.email}, 14 dagen geldig.`, (s) => ({
      edits: { ...s.edits, [row.id]: { ...s.edits[row.id], portal: "uitgenodigd" } }
    }))
  return (
    <PageSection
      id="portaal"
      title="Portaal"
      meta={<Status tone={PORTAL[row.portal].tone}>{PORTAL[row.portal].label}</Status>}
      actions={
        <span className="flex items-center gap-1">
          <ButtonLink size="sm" variant="ghost" icon={<Eye />} to={paths.supplierPortal()}>
            Bekijken zoals zij het zien
          </ButtonLink>
          {canEdit && row.portal === "geen" && <Button size="sm" icon={<Send />} onClick={invite}>Uitnodigen</Button>}
          {canEdit && row.portal !== "geen" && (
            <Button size="sm" variant="ghost" icon={<UserX />} onClick={onRevoke}>Toegang intrekken</Button>
          )}
        </span>
      }
    >
      {row.portal === "geen"
        ? (
          <p className="text-sm text-pretty text-ink-3">
            {row.name}{" "}
            werkt nog niet in het portaal. Daar zien ze hun bestellingen, werken ze voorraad bij en praten ze met jullie
            team, zonder de contactgegevens van je klanten.
          </p>
        )
        : (
          <div className="flex flex-col">
            {PORTAL_SCOPES.map((scope) => {
              const on = scope.fixed === true || row.scopes.includes(scope.id)
              if (!canEdit || scope.fixed === true) {
                return (
                  <div key={scope.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="font-medium text-ink">{scope.label}</span>
                      <span className="text-xs text-ink-3">{scope.detail}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {scope.fixed === true ? "Altijd" : on ? "Aan" : "Uit"}
                    </span>
                  </div>
                )
              }
              return (
                <ToggleRow
                  key={scope.id}
                  title={scope.label}
                  detail={scope.detail}
                  on={on}
                  onChange={(next) =>
                    withUndo(
                      next
                        ? `${row.name} ziet nu: ${scope.label.toLowerCase()}`
                        : `${scope.label} uit voor ${row.name}`,
                      undefined,
                      (s) => ({
                        edits: {
                          ...s.edits,
                          [row.id]: {
                            ...s.edits[row.id],
                            scopes: next ? [...row.scopes, scope.id] : row.scopes.filter((x) => x !== scope.id)
                          }
                        }
                      })
                    )}
                />
              )
            })}
          </div>
        )}
    </PageSection>
  )
}
