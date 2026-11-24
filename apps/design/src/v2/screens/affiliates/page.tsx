import { useState } from "react"
import type { Resource } from "../../fixtures/affiliate-portal.ts"
import {
  affiliateCounts,
  affiliateRows,
  applicationRows,
  inviteRows,
  PAYOUT_MONTH,
  payoutRows,
  resourceRows,
  RETURN_DAYS,
  tierOf,
  TIERS,
  useAffiliateState
} from "../../fixtures/affiliates.ts"
import type { AffiliateRow, Application, Tier } from "../../fixtures/affiliates.ts"
import { euro } from "../../fixtures/records.ts"
import { paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Sheet } from "../../ui/dialog.tsx"
import { FileDrop } from "../../ui/file-drop.tsx"
import {
  Check,
  Download,
  Eye,
  FileText,
  Image,
  Pause,
  Play,
  Send,
  Trash,
  UserPlus,
  Users,
  Video,
  X
} from "../../ui/icons.tsx"
import { Field, Select } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { hasLogo, ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { ApproveDialog, InviteDialog, RejectDialog, withUndo } from "./dialogs.tsx"
import { PageError, TableSkeleton } from "./parts.tsx"

export type Weergave = "actief" | "aanmeldingen" | "uitbetalingen" | "uitnodigingen" | "materiaal"

const WEERGAVEN: ReadonlySet<string> = new Set<Weergave>([
  "actief",
  "aanmeldingen",
  "uitbetalingen",
  "uitnodigingen",
  "materiaal"
])

export const weergaveOf = (raw: string | null): Weergave =>
  raw !== null && WEERGAVEN.has(raw) ? (raw as Weergave) : "actief"

/**
 * Affiliates (`/app/affiliates`): the people who sell for the brand on commission. Who is in and what
 * they brought, who applied (approve on a tier, or reject with a reason they read), this month's
 * payouts (only what is past the {RETURN_DAYS}-day return window can be approved), and open invites.
 * One affiliate opens in a sheet (`?open=<id>`).
 */
export function AffiliatesPage() {
  const view = useView()
  const s = useAffiliateState()
  const access = useAccess("affiliates")
  const state = dataState(view)
  const tab = weergaveOf(useQuery("weergave"))
  const openId = useQuery("open")
  const [approve, setApprove] = useState<Application | null>(null)
  const [reject, setReject] = useState<Application | null>(null)
  const [inviting, setInviting] = useState(false)

  if (!access.view) {
    return (
      <Page>
        <PageHead title="Affiliates" />
        <Denied area="affiliates" what="het affiliateprogramma" />
      </Page>
    )
  }

  const counts = affiliateCounts(view, s)
  const people = affiliateRows(view, s)
  const open = openId === null ? undefined : people.find((p) => p.id === openId)

  return (
    <Page>
      <PageHead
        title="Affiliates"
        meta={state === "ready"
          ? `${counts.actief} actief · ${counts.aanmeldingen} aanmeldingen · ${
            euro(counts.teKeuren)
          } uit te betalen voor ${PAYOUT_MONTH.label}`
          : undefined}
        actions={access.edit && state !== "loading" && state !== "error"
          ? (
            <Button variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>
              Affiliate uitnodigen
            </Button>
          )
          : undefined}
      />
      {!access.edit && <ReadOnlyNotice area="affiliates" />}

      {state === "loading" && <TableSkeleton label="Affiliates laden" columns={6} rows={4} />}
      {state === "error" && (
        <PageError title="Het programma kwam niet binnen" detail="GET /affiliates · 503">
          De gegevens laadden niet. Codes en links werken gewoon; commissies worden later bijgeschreven.
        </PageError>
      )}
      {state === "empty" && (
        <EmptyState
          glyph={Users}
          title="Nog geen affiliates"
          action={access.edit
            ? (
              <Button variant="primary" icon={<UserPlus />} onClick={() => setInviting(true)}>
                Affiliate uitnodigen
              </Button>
            )
            : undefined}
        >
          Affiliates verkopen voor je met een eigen code en link, op commissie. Nodig iemand uit die al over je merk
          praat, of deel je aanmeldpagina.
        </EmptyState>
      )}

      {state === "ready" && (
        <div className="flex min-w-0 flex-col gap-6">
          <Tabs
            label="Affiliateweergave"
            value={tab}
            onChange={(next) => setQuery({ weergave: next === "actief" ? null : next })}
            tabs={[
              { value: "actief", label: "Actief", count: counts.actief },
              { value: "aanmeldingen", label: "Aanmeldingen", count: counts.aanmeldingen },
              { value: "uitbetalingen", label: "Uitbetalingen", count: counts.uitbetalingen },
              { value: "uitnodigingen", label: "Uitnodigingen", count: counts.uitnodigingen },
              { value: "materiaal", label: "Materiaal", count: counts.materiaal }
            ]}
          />
          {tab === "actief" && <Active rows={people} />}
          {tab === "aanmeldingen" && <Applications canEdit={access.edit} onApprove={setApprove} onReject={setReject} />}
          {tab === "uitbetalingen" && <Payouts canEdit={access.edit} />}
          {tab === "uitnodigingen" && <Invites canEdit={access.edit} onInvite={() => setInviting(true)} />}
          {tab === "materiaal" && <Material canEdit={access.edit} />}
        </div>
      )}

      <AffiliateSheet row={open} canEdit={access.edit} onClose={() => setQuery({ open: null })} />
      <ApproveDialog app={approve} onClose={() => setApprove(null)} />
      <RejectDialog app={reject} onClose={() => setReject(null)} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </Page>
  )
}

/* ── active ────────────────────────────────────────────────────────────────────────────────────── */

function Active({ rows }: { readonly rows: ReadonlyArray<AffiliateRow> }) {
  return (
    <Table label="Actieve affiliates" minWidth={760}>
      <THead>
        <Th>Affiliate</Th>
        <Th>Code</Th>
        <Th>Tier</Th>
        <Th align="right">Bestellingen</Th>
        <Th align="right">Verdiend</Th>
        <Th>Beste bron</Th>
      </THead>
      <TBody>
        {rows.map((a) => (
          <Tr key={a.id} onOpen={() => setQuery({ open: a.id })}>
            <Td header className="py-1.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={a.name} size={24} />
                <span className="flex min-w-0 flex-col">
                  <button
                    type="button"
                    onClick={() => setQuery({ open: a.id })}
                    className="max-w-[16rem] truncate text-left font-medium text-ink hover:underline"
                  >
                    {a.name}
                  </button>
                  <span className="max-w-[16rem] truncate text-2xs text-ink-3">{a.channel}</span>
                </span>
                {a.paused && <Status tone="neutral">Gepauzeerd</Status>}
                {a.fresh && <Status tone="accent">Nieuw</Status>}
              </span>
            </Td>
            <Td muted>{a.code}</Td>
            <Td>
              {tierOf(a.tier).label} <span className="figure text-ink-3">· {a.rate}%</span>
            </Td>
            <Td figure align="right">{a.conversions}</Td>
            <Td figure align="right">{euro(a.earned)}</Td>
            <Td muted className="max-w-[14rem] truncate">{a.top}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

function AffiliateSheet({ row, canEdit, onClose }: {
  readonly row: AffiliateRow | undefined
  readonly canEdit: boolean
  readonly onClose: () => void
}) {
  const view = useView()
  const s = useAffiliateState()
  if (row === undefined) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>
  const payout = payoutRows(view, s).find((p) => p.affiliateId === row.id)
  const togglePause = () =>
    withUndo(
      row.paused ? `${row.name} hervat` : `${row.name} gepauzeerd`,
      row.paused ? undefined : "Hun code werkt nog, maar levert geen commissie op.",
      (st) => ({
        ...st,
        paused: row.paused ? st.paused.filter((x) => x !== row.id) : [...st.paused, row.id]
      })
    )
  return (
    <Sheet
      open
      onClose={onClose}
      title={row.name}
      meta={
        <>
          <span>{row.email}</span>
          {row.paused && <Status tone="neutral">Gepauzeerd</Status>}
        </>
      }
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <ButtonLink size="sm" variant="ghost" icon={<Eye />} to={paths.affiliatePortal()}>
            Bekijken zoals zij het zien
          </ButtonLink>
          {canEdit && (
            <Button size="sm" icon={row.paused ? <Play /> : <Pause />} onClick={togglePause}>
              {row.paused ? "Hervatten" : "Pauzeren"}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <KeyValue
          items={[
            { label: "Code", value: row.code },
            { label: "Kanaal", value: row.channel },
            { label: "Sinds", value: row.joined },
            { label: "Bestellingen", value: row.conversions, figure: true },
            { label: "Verdiend", value: euro(row.earned), figure: true },
            { label: "Beste bron", value: row.top }
          ]}
        />
        {canEdit
          ? (
            <Field label="Tier" hint="Een nieuwe tier geldt voor bestellingen vanaf nu.">
              {(control) => (
                <Select
                  {...control}
                  value={row.tier}
                  onChange={(e) => {
                    const tier = e.target.value as Tier
                    withUndo(
                      `${row.name} staat nu op ${tierOf(tier).label}`,
                      `${tierOf(tier).rate}% commissie vanaf nu.`,
                      (st) => ({
                        ...st,
                        tiers: { ...st.tiers, [row.id]: tier }
                      })
                    )
                  }}
                >
                  {TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}, {t.rate}% commissie</option>)}
                </Select>
              )}
            </Field>
          )
          : <KeyValue items={[{ label: "Tier", value: `${tierOf(row.tier).label}, ${row.rate}% commissie` }]} />}
        {payout !== undefined && (
          <section aria-labelledby="sheet-payout" className="flex flex-col gap-2">
            <h3 id="sheet-payout" className="text-sm font-semibold text-ink">{PAYOUT_MONTH.label}</h3>
            <KeyValue
              items={[
                { label: "Goed te keuren", value: euro(payout.approvable), figure: true },
                { label: `Binnen ${RETURN_DAYS} dagen`, value: euro(payout.inWindow), figure: true },
                ...(payout.reversed > 0
                  ? [{ label: "Teruggedraaid", value: `− ${euro(payout.reversed)}`, figure: true }]
                  : []),
                { label: "Uitbetaling", value: payout.approved ? `Goedgekeurd, ${PAYOUT_MONTH.payDay}` : payout.method }
              ]}
            />
          </section>
        )}
      </div>
    </Sheet>
  )
}

/* ── applications ──────────────────────────────────────────────────────────────────────────────── */

function Applications({ canEdit, onApprove, onReject }: {
  readonly canEdit: boolean
  readonly onApprove: (a: Application) => void
  readonly onReject: (a: Application) => void
}) {
  const view = useView()
  const s = useAffiliateState()
  const apps = applicationRows(view, s)
  const pending = apps.filter((a) => a.status === "in-afwachting")
  const decided = apps.filter((a) => a.status !== "in-afwachting")
  return (
    <div className="flex flex-col gap-8">
      {pending.length === 0
        ? <p className="text-sm text-ink-3">Geen aanmeldingen die op je wachten.</p>
        : (
          <ul aria-label="Aanmeldingen" className="flex flex-col">
            {pending.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 border-b border-line py-4 first:pt-0 last:border-0 sm:flex-row sm:items-start"
              >
                <span className="flex min-w-0 flex-1 gap-3">
                  <Avatar name={a.name} size={32} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium text-ink">
                      {a.name} <span className="font-normal text-ink-3">· {a.applied}</span>
                    </span>
                    <span className="text-xs text-ink-3">{a.channel} · {a.audience} · {a.handle}</span>
                    <span className="max-w-[60ch] text-sm text-pretty text-ink-2">{a.motivation}</span>
                  </span>
                </span>
                {canEdit && (
                  <span className="flex shrink-0 gap-2 pl-11 sm:pl-0">
                    <Button size="sm" variant="ghost" icon={<X />} onClick={() => onReject(a)}>Afwijzen</Button>
                    <Button size="sm" variant="primary" icon={<Check />} onClick={() => onApprove(a)}>
                      Goedkeuren
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      {decided.length > 0 && (
        <section aria-labelledby="besloten" className="flex flex-col gap-3">
          <h2 id="besloten" className="text-sm font-semibold text-ink">Besloten</h2>
          <Table label="Besloten aanmeldingen" minWidth={560}>
            <THead>
              <Th>Naam</Th>
              <Th>Kanaal</Th>
              <Th>Besluit</Th>
            </THead>
            <TBody>
              {decided.map((a) => (
                <Tr key={a.id}>
                  <Td header>{a.name}</Td>
                  <Td muted className="max-w-[14rem] truncate">{a.channel} · {a.audience}</Td>
                  <Td className="max-w-[22rem]">
                    <span className="flex min-w-0 flex-col">
                      <Status tone={a.status === "goedgekeurd" ? "good" : "neutral"}>
                        {a.status === "goedgekeurd" ? "Goedgekeurd" : "Afgewezen"}
                      </Status>
                      {a.reason !== undefined && <span className="truncate text-2xs text-ink-3">{a.reason}</span>}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </section>
      )}
    </div>
  )
}

/* ── payouts ───────────────────────────────────────────────────────────────────────────────────── */

const approvePayouts = (ids: ReadonlyArray<string>, label: string) =>
  withUndo(label, `Uitbetaald op ${PAYOUT_MONTH.payDay}.`, (st) => ({ ...st, approved: [...st.approved, ...ids] }))

function Payouts({ canEdit }: { readonly canEdit: boolean }) {
  const view = useView()
  const s = useAffiliateState()
  const rows = payoutRows(view, s)
  const open = rows.filter((r) => !r.approved && r.approvable > 0)
  const total = open.reduce((n, r) => n + r.approvable, 0)
  return (
    <div className="flex flex-col gap-4">
      <Notice
        tone="info"
        title={`${euro(total)} goed te keuren voor ${PAYOUT_MONTH.label}`}
        action={canEdit && open.length > 1
          ? (
            <Button
              size="sm"
              onClick={() => approvePayouts(open.map((r) => r.affiliateId), `${open.length} uitbetalingen goedgekeurd`)}
            >
              Alles goedkeuren
            </Button>
          )
          : undefined}
      >
        Alleen commissie op bestellingen die langer dan {RETURN_DAYS}{" "}
        dagen geleden zijn, de retourtermijn. Commissie op een terugbetaalde bestelling wordt teruggedraaid.
      </Notice>
      <Table label={`Uitbetalingen ${PAYOUT_MONTH.label}`} minWidth={760}>
        <THead>
          <Th>Affiliate</Th>
          <Th align="right">Bestellingen</Th>
          <Th align="right">Goed te keuren</Th>
          <Th align="right">Binnen termijn</Th>
          <Th align="right">Teruggedraaid</Th>
          <Th>Via</Th>
          <Th align="right">
            <span className="sr-only">Actie</span>
          </Th>
        </THead>
        <TBody>
          {rows.map((r) => (
            <Tr key={r.affiliateId}>
              <Td header>
                <button
                  type="button"
                  onClick={() => setQuery({ open: r.affiliateId })}
                  className="text-left hover:underline"
                >
                  {r.name}
                </button>
              </Td>
              <Td figure align="right">{r.orders}</Td>
              <Td figure align="right">{euro(r.approvable)}</Td>
              <Td figure align="right" muted>{euro(r.inWindow)}</Td>
              <Td figure align="right" muted>{r.reversed > 0 ? `− ${euro(r.reversed)}` : "—"}</Td>
              <Td muted>
                <span className="flex items-center gap-2">
                  {hasLogo(r.method)
                    ? <ServiceLogo service={r.method} name={r.method} size={18} />
                    : <span aria-hidden="true" className="size-[18px] shrink-0" />}
                  {r.method}
                </span>
              </Td>
              <Td align="right">
                {r.approved
                  ? <Status tone="good">Goedgekeurd</Status>
                  : canEdit
                  ? (
                    <Button
                      size="sm"
                      onClick={() => approvePayouts([r.affiliateId], `Uitbetaling aan ${r.name} goedgekeurd`)}
                    >
                      Goedkeuren
                    </Button>
                  )
                  : <Status tone="neutral">Te keuren</Status>}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

/* ── invites ───────────────────────────────────────────────────────────────────────────────────── */

function Invites({ canEdit, onInvite }: { readonly canEdit: boolean; readonly onInvite: () => void }) {
  const view = useView()
  const s = useAffiliateState()
  const rows = inviteRows(view, s)
  if (rows.length === 0) {
    return (
      <EmptyState
        glyph={Send}
        size="sm"
        title="Geen open uitnodigingen"
        action={canEdit
          ? <Button size="sm" icon={<UserPlus />} onClick={onInvite}>Affiliate uitnodigen</Button>
          : undefined}
      >
        Wie je uitnodigt, slaat de aanmelding over.
      </EmptyState>
    )
  }
  return (
    <Table label="Open uitnodigingen" minWidth={640}>
      <THead>
        <Th>Naam</Th>
        <Th>Tier</Th>
        <Th>Verstuurd</Th>
        <Th>Verloopt</Th>
        <Th align="right">
          <span className="sr-only">Acties</span>
        </Th>
      </THead>
      <TBody>
        {rows.map((i) => (
          <Tr key={i.id}>
            <Td header className="py-1.5">
              <span className="flex min-w-0 flex-col">
                <span className="font-medium">{i.name}</span>
                <span className="truncate text-2xs text-ink-3">{i.email}</span>
              </span>
            </Td>
            <Td>{tierOf(i.tier).label}</Td>
            <Td muted>{i.sent}</Td>
            <Td muted>{i.expires}</Td>
            <Td align="right">
              {canEdit && (
                <span className="inline-flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toast({ title: `Uitnodiging opnieuw verstuurd naar ${i.name}`, tone: "good" })}
                  >
                    Opnieuw sturen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      withUndo(`Uitnodiging aan ${i.name} ingetrokken`, "Hun link werkt niet meer.", (st) => ({
                        ...st,
                        revoked: [...st.revoked, i.id]
                      }))}
                  >
                    Intrekken
                  </Button>
                </span>
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

/* ── material ──────────────────────────────────────────────────────────────────────────────────── */

const KIND_GLYPH = { logo: Image, afbeelding: Image, video: Video, document: FileText, gids: FileText } as const
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const dayLabel = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""}`

const kindOf = (type: string): Resource["kind"] =>
  type.startsWith("image/") ? "afbeelding" : type.startsWith("video/") ? "video" : "document"

const sizeOf = (file: File) => {
  const ext = (file.name.split(".").pop() ?? "").toUpperCase()
  const mb = file.size / 1_000_000
  const size = mb >= 1
    ? `${mb.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`
    : `${Math.max(1, Math.round(file.size / 1000))} KB`
  return ext === "" ? size : `${size} · ${ext}`
}

/** New material from dropped or picked files, with an undo. */
function upload(files: ReadonlyArray<File>) {
  if (files.length === 0) return
  const made = files.map((f, i): Resource => ({
    id: `res_${Math.random().toString(36).slice(2, 8)}${i}`,
    name: f.name.replace(/\.[^.]+$/, ""),
    kind: kindOf(f.type),
    size: sizeOf(f),
    updatedAt: new Date(2026, 10, 23, 14, 30)
  }))
  withUndo(
    made.length === 1 ? `${made[0]?.name ?? ""} geüpload` : `${made.length} bestanden geüpload`,
    "Je affiliates zien het nu bij Materiaal in hun portaal.",
    (st) => ({ ...st, uploaded: [...made, ...st.uploaded] })
  )
}

/**
 * Materiaal: what the affiliates download in their portal (logos, photos, reels, guides). Uploading
 * and taking down is for whoever may change the programme; a removal can be undone.
 */
function Material({ canEdit }: { readonly canEdit: boolean }) {
  const view = useView()
  const s = useAffiliateState()
  const items = resourceRows(view, s)

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      {canEdit && (
        <FileDrop
          accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf,video/mp4,application/zip"
          label="Sleep bestanden hierheen of kies ze"
          hint="Logo's, foto's, reels en gidsen: PNG, JPG, SVG, PDF, MP4 of ZIP"
          onFiles={upload}
        />
      )}
      {items.length === 0
        ? (
          <EmptyState size="sm" glyph={FileText} title="Nog geen materiaal">
            Logo's, productfoto's en richtlijnen die je hier zet, kunnen je affiliates in hun portaal downloaden.
          </EmptyState>
        )
        : (
          <List label="Materiaal" divided>
            {items.map((r) => {
              const G = KIND_GLYPH[r.kind]
              return (
                <ListRow
                  key={r.id}
                  padded={false}
                  lead={
                    <GlyphTile>
                      <G size={15} />
                    </GlyphTile>
                  }
                  title={r.name}
                  meta={`${r.size} · bijgewerkt ${dayLabel(r.updatedAt)}`}
                  trail={
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Download />}
                        onClick={() => toast({ title: `${r.name} wordt gedownload`, body: r.size })}
                      >
                        Downloaden
                      </Button>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash />}
                          onClick={() =>
                            withUndo(`${r.name} verwijderd`, "Affiliates zien het niet meer in hun portaal.", (st) => ({
                              ...st,
                              removed: [...st.removed, r.id]
                            }))}
                        >
                          Verwijderen
                        </Button>
                      )}
                    </>
                  }
                />
              )
            })}
          </List>
        )}
    </div>
  )
}
