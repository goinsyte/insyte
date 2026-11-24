import { useState } from "react"
import {
  CHECK_KIND,
  CHECK_STATUS,
  COMPLAINT_THRESHOLD,
  DELIVERABLE,
  getProductState,
  percent,
  PHASE,
  qualityOf,
  setProductState,
  silhouetteOf,
  useProductState
} from "../../fixtures/products.ts"
import type { CheckKind, Phase, ProductRow, QualityCheck } from "../../fixtures/products.ts"
import { qualityCheck as publicCheck } from "../../fixtures/public.ts"
import { findSupplier } from "../../fixtures/suppliers.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths, setQuery, useQuery } from "../../router.tsx"
import { copyAndSay } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { Sheet } from "../../ui/dialog.tsx"
import {
  AlertTriangle,
  Box,
  ClipboardCheck,
  Copy,
  Eye,
  MessageSquare,
  Returns,
  RotateCcw,
  Video,
  XCircle
} from "../../ui/icons.tsx"
import { Field, Textarea } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"
import { dropTickets } from "../inbox/store.ts"
import { fileSupplierTickets } from "../suppliers/tickets.ts"
import { withUndo } from "./dialogs.tsx"
import { Figures, ProductArt } from "./parts.tsx"

/*
 * Kwaliteit, the product page's second tab (`/app`'s `quality/quality-tab.tsx`, PLAN 26): the phase
 * the product is in, the complaint rate against the 5% line, the checks asked of the supplier and the
 * complaints, filtered by size. A check opens in a drawer (`?controle=qc-306`) where it is judged:
 * Goedkeuren with undo, Afkeuren with a reason the supplier reads, a ticket and the watch in one go.
 */

const PHASES = Object.keys(PHASE) as ReadonlyArray<Phase>

/** "Te laat" outranks the check's own status while nothing came in by the date. */
function CheckStatus({ c }: { readonly c: QualityCheck }) {
  return (
    <Status tone={c.late === true && c.status === "aangevraagd" ? "bad" : CHECK_STATUS[c.status].tone}>
      {c.late === true && c.status === "aangevraagd" ? "Te laat" : CHECK_STATUS[c.status].label}
    </Status>
  )
}

export function QualityTab({ row, canEdit, onRequest }: {
  readonly row: ProductRow
  readonly canEdit: boolean
  readonly onRequest: (kind: CheckKind) => void
}) {
  const s = useProductState()
  const q = qualityOf(row, s)
  const open = useQuery("controle")
  const [size, setSize] = useState("alle")
  const watched = q.phase === "toezicht"
  const fits = (sizes: ReadonlyArray<string>) => size === "alle" || sizes.length === 0 || sizes.includes(size)
  const checks = q.checks.filter((c) => fits(c.sizes))
  const complaints = q.complaints.filter((k) => size === "alle" || k.size === size)
  const running = q.checks.filter((c) => c.status === "aangevraagd" || c.status === "ingestuurd").length
  const waiting = q.checks.filter((c) => c.status === "ingestuurd")

  const setPhase = (phase: Phase) =>
    withUndo(
      `Fase van ${row.name}: ${PHASE[phase].label.toLowerCase()}`,
      phase === "toezicht"
        ? "Elke nieuwe klacht komt bij jou binnen, en nieuwe batches vragen een controle."
        : phase === "uitgefaseerd"
        ? "Het product blijft in Shopify staan; Insyte vraagt er geen controles meer voor."
        : undefined,
      (st) => ({ ...st, edits: { ...st.edits, [row.id]: { ...st.edits[row.id], phase } } })
    )

  return (
    <div className="flex flex-col gap-10">
      {q.over && (
        <Notice tone="bad" title={`${percent(q.rate, 1)} klachten, boven de grens van ${percent(COMPLAINT_THRESHOLD)}`}>
          {q.complaints.length} klachten op {q.sold90} verkocht in 90 dagen.{" "}
          {watched ? "Het product staat onder toezicht." : "Overweeg het onder toezicht te zetten."}
        </Notice>
      )}
      {waiting.map((c) => (
        <Notice
          key={c.id}
          tone="info"
          title={`${c.submission?.by ?? row.supplierName} stuurde de ${CHECK_KIND[c.kind].toLowerCase()} in`}
          action={<Button size="sm" onClick={() => setQuery({ controle: c.id })}>Beoordelen</Button>}
        >
          {c.submission?.photos.length ?? 0}{" "}
          foto's{c.submission?.batch === undefined ? "" : `, batch ${c.submission.batch}`}
          {" · "}
          {c.submission?.at}. Het wacht op jouw oordeel.
        </Notice>
      ))}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <Figures
          label="Kwaliteit, laatste 90 dagen"
          items={[
            {
              label: "Klachtpercentage",
              note: `${q.complaints.length} op ${q.sold90.toLocaleString("nl-NL")} verkocht`,
              value: <span className={q.over ? "text-bad-ink" : undefined}>{percent(q.rate, 1)}</span>
            },
            { label: "Goedgekeurd", value: q.passed },
            {
              label: "Afgekeurd",
              value: <span className={q.judged - q.passed > 0 ? "text-bad-ink" : undefined}>{q.judged - q.passed}</span>
            },
            { label: "Loopt", value: running }
          ]}
        />
        <div className="flex flex-col items-start gap-1.5">
          <span className="text-xs text-ink-3">Fase</span>
          <Segmented
            label="Productfase"
            size="sm"
            value={q.phase}
            disabled={!canEdit}
            onChange={(next) => next !== q.phase && setPhase(next)}
            options={PHASES.map((p) => ({ value: p, label: PHASE[p].label }))}
          />
        </div>
      </div>

      <PageSection
        id="controles"
        title="Controles"
        meta={q.checks.length === 0 ? undefined : String(q.checks.length)}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {row.sizes.length > 1 && (
              <Segmented
                label="Maat"
                size="sm"
                value={size}
                onChange={setSize}
                options={[{ value: "alle", label: "Alle maten" }, ...row.sizes.map((x) => ({ value: x, label: x }))]}
              />
            )}
            {canEdit && (
              <>
                <Button size="sm" variant="ghost" icon={<Box />} onClick={() => onRequest("monster")}>
                  Monster bestellen
                </Button>
                <Button size="sm" icon={<ClipboardCheck />} onClick={() => onRequest("batch")}>
                  Controle aanvragen
                </Button>
              </>
            )}
          </span>
        }
      >
        {checks.length === 0
          ? (
            <p className="text-sm text-ink-3">
              {q.checks.length === 0
                ? `Nog geen controles. Vraag ${row.supplierName} om foto's van een batch, een monster of een testbestelling.`
                : `Geen controles voor maat ${size}.`}
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
                {checks.map((c) => (
                  <Tr key={c.id} onOpen={() => setQuery({ controle: c.id })}>
                    <Td header className="py-1.5">
                      <span className="flex min-w-0 flex-col">
                        <button
                          type="button"
                          onClick={() => setQuery({ controle: c.id })}
                          className="text-left font-medium hover:underline"
                        >
                          {CHECK_KIND[c.kind]}
                        </button>
                        <span className="max-w-[20rem] truncate text-2xs text-ink-3">{c.verdict ?? c.note}</span>
                      </span>
                    </Td>
                    <Td muted>{c.sizes.length === 0 ? "alle" : c.sizes.join(", ")}</Td>
                    <Td>
                      <CheckStatus c={c} />
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
        meta={complaints.length === 0 ? undefined : String(complaints.length)}
      >
        {complaints.length === 0
          ? (
            <p className="text-sm text-ink-3">
              {size === "alle"
                ? "Geen klachten over de kwaliteit in de laatste 90 dagen."
                : `Geen klachten over maat ${size}.`}
            </p>
          )
          : (
            <List label="Klachten over dit product">
              {complaints.map((k) => (
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

      <CheckSheet
        row={row}
        check={q.checks.find((c) => c.id === open)}
        canEdit={canEdit}
        onClose={() => setQuery({ controle: null })}
      />
    </div>
  )
}

/**
 * One check: what was asked, what came back (the photos, the batch, the video, the supplier's line)
 * and the verdict. Goedkeuren has Undo; Afkeuren asks for a reason the supplier can act on, and can
 * open a ticket with the supplier and put the product under watch in the same move.
 */
function CheckSheet({ row, check, canEdit, onClose }: {
  readonly row: ProductRow
  readonly check: QualityCheck | undefined
  readonly canEdit: boolean
  readonly onClose: () => void
}) {
  const view = useView()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState("")
  const [ticket, setTicket] = useState(true)
  const [watch, setWatch] = useState(true)
  const contact = findSupplier(row.supplierId, view)?.contact
  const who = contact === undefined || contact === "—" ? row.supplierName : `${contact} van ${row.supplierName}`
  const shape = silhouetteOf(row.id)
  const close = () => {
    setRejecting(false)
    setReason("")
    onClose()
  }

  const approve = (c: QualityCheck) => {
    withUndo("Controle goedgekeurd", `${row.supplierName} ziet het in hun portaal.`, (st) => ({
      ...st,
      verdicts: { ...st.verdicts, [c.id]: { status: "goedgekeurd", by: ME.name, at: "vandaag 14:30" } }
    }))
  }
  const reject = (c: QualityCheck) => {
    const before = getProductState()
    const text = reason.trim()
    setProductState((st) => ({
      ...st,
      verdicts: { ...st.verdicts, [c.id]: { status: "afgekeurd", by: ME.name, at: "vandaag 14:30", reason: text } },
      edits: watch ? { ...st.edits, [row.id]: { ...st.edits[row.id], phase: "toezicht" } } : st.edits
    }))
    const filed = ticket
      ? fileSupplierTickets([{
        supplierId: row.supplierId,
        subject: `${CHECK_KIND[c.kind]} van ${row.name} afgekeurd`,
        note: `Afgekeurd: ${text} Vraag ${row.supplierName} om een nieuwe batch en een datum.`,
        priority: "hoog",
        also: { kind: "product", id: row.id, label: row.name }
      }], { quiet: true })
      : []
    toast({
      title: "Controle afgekeurd",
      body: [
        `${row.supplierName} krijgt de reden in hun portaal.`,
        filed[0] === undefined ? "" : `Ticket #${filed[0]} staat op het bord.`,
        watch ? `${row.name} staat onder toezicht.` : ""
      ].filter((x) => x !== "").join(" "),
      tone: "good",
      duration: 30_000,
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          setProductState(() => before)
          dropTickets(filed)
          toast({ title: "Teruggezet" })
        }
      }
    })
    setRejecting(false)
    setReason("")
  }

  const c = check
  const link = c === undefined ? undefined : publicCheck(c.id)
  return (
    <Sheet
      open={c !== undefined}
      onClose={close}
      title={c === undefined ? "" : CHECK_KIND[c.kind]}
      meta={c === undefined ? undefined : (
        <>
          <span>{row.name} · {row.supplierName}</span>
          <CheckStatus c={c} />
        </>
      )}
      footer={c !== undefined && c.status === "ingestuurd" && canEdit && !rejecting
        ? (
          <>
            <Button icon={<XCircle />} onClick={() => setRejecting(true)}>Afkeuren</Button>
            <Button variant="primary" onClick={() => approve(c)}>Goedkeuren</Button>
          </>
        )
        : undefined}
    >
      {c !== undefined && (
        <div className="flex flex-col gap-7">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-ink-3">Gevraagd door {c.requestedBy} · {c.requestedAt}</h3>
            <p className="text-sm text-pretty text-ink">{c.note}</p>
            <p className="text-xs text-ink-3">
              {c.deliver.map((d) => DELIVERABLE[d]).join(", ")} ·{" "}
              {c.sizes.length === 0 ? "alle maten" : c.sizes.join(", ")}
              {" · vóór "}
              {c.due}
            </p>
            {c.late === true && c.status === "aangevraagd" && (
              <p className="flex items-center gap-1.5 text-xs text-bad-ink">
                <AlertTriangle size={13} />
                Nog niets binnen, de datum is verstreken.
              </p>
            )}
          </section>

          {c.submission === undefined
            ? (
              <section className="flex flex-col items-start gap-3 rounded-md bg-well px-3.5 py-3">
                <p className="text-sm text-pretty text-ink-2">
                  {row.supplierName} heeft nog niets ingestuurd. {who}{" "}
                  ziet het verzoek in het portaal en antwoordt via de link.
                </p>
                <span className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    icon={<Copy />}
                    onClick={() => copyAndSay(`${window.location.origin}${paths.qualityCheck(c.id)}`, "Link")}
                  >
                    Link voor {row.supplierName} kopiëren
                  </Button>
                  {link !== undefined && (
                    <ButtonLink size="sm" variant="ghost" icon={<Eye />} to={paths.qualityCheck(c.id)}>
                      Bekijken zoals zij het zien
                    </ButtonLink>
                  )}
                </span>
              </section>
            )
            : (
              <section className="flex flex-col gap-2.5">
                <h3 className="text-xs font-medium text-ink-3">
                  Ingestuurd door {c.submission.by} · {c.submission.at}
                </h3>
                <ul className="grid grid-cols-3 gap-2">
                  {c.submission.photos.map((label, i) => (
                    <li key={`${label}-${i}`} className="flex flex-col gap-1">
                      <span className="flex aspect-square items-center justify-center rounded-md bg-well">
                        <ProductArt shape={shape} view={i} className="size-3/4" />
                      </span>
                      <span className="truncate text-2xs text-ink-3">{label}</span>
                    </li>
                  ))}
                  {c.submission.video && (
                    <li className="flex flex-col gap-1">
                      <span className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md bg-well text-xs text-ink-2">
                        <Video size={20} />
                        Video
                      </span>
                    </li>
                  )}
                </ul>
                {c.submission.batch !== undefined && (
                  <p className="text-sm text-ink-2">
                    Batch <span className="figure text-ink">{c.submission.batch}</span>
                  </p>
                )}
                {c.submission.note !== undefined && (
                  <p className="text-sm text-pretty text-ink">“{c.submission.note}”</p>
                )}
              </section>
            )}

          {(c.status === "goedgekeurd" || c.status === "afgekeurd") && (
            <Notice
              tone={c.status === "goedgekeurd" ? "good" : "bad"}
              title={`${c.status === "goedgekeurd" ? "Goedgekeurd" : "Afgekeurd"} door ${c.verdictBy ?? "het team"}${
                c.verdictAt === undefined ? "" : ` · ${c.verdictAt}`
              }`}
            >
              {c.verdict}
            </Notice>
          )}
          {c.status === "afgekeurd" && (
            <p className="flex items-center gap-1.5 text-xs text-ink-3">
              <RotateCcw size={13} />
              {row.supplierName} kan de controle via dezelfde link opnieuw insturen.
            </p>
          )}

          {c.status === "ingestuurd" && canEdit && rejecting && (
            <section className="flex flex-col gap-3">
              <Field label="Waarom afgekeurd" hint={`${row.supplierName} leest dit.`}>
                {(control) => (
                  <Textarea
                    {...control}
                    rows={3}
                    value={reason}
                    placeholder="Bijvoorbeeld: de stiksels bij de kamers lopen niet door tot de zoom"
                    onChange={(e) => setReason(e.target.value)}
                  />
                )}
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                Ticket met {row.supplierName} openen
                <Toggle label={`Ticket met ${row.supplierName} openen`} on={ticket} onChange={setTicket} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-ink">
                Product onder toezicht zetten
                <Toggle label="Product onder toezicht zetten" on={watch} onChange={setWatch} />
              </label>
              <span className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)}>Annuleren</Button>
                <Button variant="danger" disabled={reason.trim() === ""} onClick={() => reject(c)}>Afkeuren</Button>
              </span>
            </section>
          )}

          <p className="text-xs text-ink-3">
            Over{" "}
            <Link to={paths.supplier(row.supplierId)} className="text-ink-2 hover:underline">{row.supplierName}</Link>
            {": "}
            alle controles en klachten per product staan op hun pagina.
          </p>
        </div>
      )}
    </Sheet>
  )
}
