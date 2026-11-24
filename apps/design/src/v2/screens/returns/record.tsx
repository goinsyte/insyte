import { useState } from "react"
import { useDemo } from "../../demo.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import { longDate, money, stamp } from "../../fixtures/order-desk.ts"
import { customer, order, product } from "../../fixtures/records.ts"
import {
  amountOf,
  changeReturns,
  deadlineOf,
  findReturn,
  moveReturn,
  pastDeadline,
  REASON_LABEL,
  REJECT_REASONS,
  RESOLUTION_DETAIL,
  RESOLUTION_LABEL,
  restoreReturns,
  RETURN_SETTINGS,
  returnsNow,
  sizeUp,
  STATUS,
  useReturnsState,
  windowOf
} from "../../fixtures/returns.ts"
import type { Resolution, ReturnRecord } from "../../fixtures/returns.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { refundLimit } from "../../ui/access.tsx"
import { undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { LoadError, RecordSkeleton } from "../../ui/data.tsx"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { Returns } from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { Fact } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Stepper } from "../../ui/stepper.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import { dataState, useView } from "../../view.ts"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { wishOf } from "./list.tsx"

/*
 * One return (`/app`'s `returns/$returnId`, `return-screen.tsx`): what came back and why, where it is
 * in the steps, the one act its state asks for, and the facts beside it. A refund confirms first,
 * names the role's limit, and keeps the 30-second send window as an undo.
 */

const STEPS = ["Aanvraag", "Akkoord", "Onderweg", "Binnen", "Afgerond"] as const
const STEP_AT: Readonly<Record<ReturnRecord["status"], number>> = {
  "te-beoordelen": 0,
  "wacht-op-pakket": 2,
  onderweg: 2,
  ontvangen: 3,
  klaar: 4,
  afgehandeld: 5,
  afgewezen: 1
}

type DialogId = "reject" | "resolve" | "confirm-refund" | null

export function ReturnRecordPage({ id }: { readonly id: string }) {
  const view = useView()
  const access = useAccess("returns")
  const state = dataState(view)
  const s = useReturnsState()
  const demo = useDemo()
  const r = findReturn(id, s)
  const [dialog, setDialog] = useState<DialogId>(null)
  const [rejectWhy, setRejectWhy] = useState(REJECT_REASONS[0] ?? "")
  const [rejectOwn, setRejectOwn] = useState("")
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const [amountRaw, setAmountRaw] = useState("")

  if (!access.view) {
    return (
      <Page width="record">
        <Denied area="returns" what="deze retour" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record">
        <PageHead title={id.toUpperCase()} />
        <RecordSkeleton />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <PageHead title={id.toUpperCase()} />
        <LoadError one what="De retour" detail={`GET /returns/${id} · 504 · req_e31b77`} />
      </Page>
    )
  }
  if (r === undefined || state === "empty") {
    return (
      <Page width="record">
        <PageHead title={id.toUpperCase()} />
        <EmptyState
          glyph={Returns}
          title="Deze retour bestaat niet"
          action={<ButtonLink to={paths.returns}>Naar retouren</ButtonLink>}
        >
          Er is geen retour met nummer{" "}
          {id.toUpperCase()}. Misschien is hij samengevoegd of is het nummer verkeerd overgenomen.
        </EmptyState>
      </Page>
    )
  }

  const p = product(r.productId)
  const who = customer(r.customerId)
  const o = order(r.orderNumber)
  const win = windowOf(r)
  const overdue = pastDeadline(r)
  const proposal = r.proposalId === undefined ? undefined : APPROVALS.find((a) => a.id === r.proposalId)
  const decided = proposal === undefined ? undefined : demo.decisions[proposal.id]?.state
  const limit = refundLimit(view.rol)
  const chosen = resolution ?? r.requested
  const amount = chosen === "terugbetalen" ? Number(amountRaw.replace(",", ".") || amountOf(r)) : amountOf(r)
  const over = chosen === "terugbetalen" && limit !== null && amount > limit
  const firstName = who?.name.split(" ")[0] ?? "de klant"
  const status = overdue ? { label: "Over de deadline", tone: "bad" as const } : STATUS[r.status]

  const move = (fields: Partial<ReturnRecord>, text: string, title: string, body?: string) => {
    const before = changeReturns((st) => moveReturn(st, r, fields, text, ME.name))
    undoable(title, () => restoreReturns(before), body)
  }
  const newLabel = () => ({
    carrier: "PostNL" as const,
    tracking: `3SNWD${r.number.slice(2).padStart(5, "0")}`,
    madeAt: returnsNow(),
    sentAt: returnsNow()
  })
  const resolve = () => {
    move(
      { status: "afgehandeld", resolution: { kind: chosen, amount, at: returnsNow(), by: ME.name } },
      `Afgehandeld: ${RESOLUTION_LABEL[chosen].toLowerCase()}${
        chosen === "terugbetalen" || chosen === "cadeaubon" ? `, ${money(amount)}` : ""
      }`,
      `${r.number} afgehandeld`,
      chosen === "terugbetalen"
        ? `${money(amount)} gaat terug naar ${who?.name ?? "de klant"}. Ongedaan maken kan de komende 30 seconden.`
        : `${firstName} krijgt ${RESOLUTION_DETAIL[chosen]}.`
    )
    setDialog(null)
  }

  const approve = () =>
    move(
      { status: "wacht-op-pakket", label: { ...(r.label ?? newLabel()), sentAt: returnsNow() } },
      "Goedgekeurd; retourlabel naar de klant gestuurd",
      `${r.number} goedgekeurd`,
      `${firstName} krijgt het retourlabel na de verzendtijd van 30 seconden.`
    )
  // While the agent's proposal is open, the proposal is the decision; the header leaves it to that block.
  const proposalOpen = proposal !== undefined && decided === undefined && r.status === "te-beoordelen"

  /** The act the state asks for, and what else it allows. */
  const primary = (() => {
    if (!access.edit) return null
    switch (r.status) {
      case "te-beoordelen":
        if (proposalOpen) return null
        return (
          <>
            <Button variant="ghost" onClick={() => setDialog("reject")}>Afwijzen</Button>
            {r.kind === "claim"
              ? (
                <Button
                  variant="primary"
                  onClick={() =>
                    move(
                      { status: "klaar" },
                      "Goedgekeurd zonder terugsturen",
                      `${r.number} goedgekeurd`,
                      "De klant hoeft niets terug te sturen."
                    )}
                >
                  Goedkeuren zonder terugsturen
                </Button>
              )
              : (
                <Button variant="primary" onClick={approve}>
                  Goedkeuren
                </Button>
              )}
          </>
        )
      case "wacht-op-pakket":
        return (
          <>
            {r.label?.sentAt === undefined && (
              <Button
                onClick={() =>
                  move(
                    { label: { ...(r.label ?? newLabel()), sentAt: returnsNow() } },
                    "Retourlabel naar de klant gestuurd",
                    "Label verstuurd"
                  )}
              >
                Label versturen
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => move({ status: "ontvangen" }, "Pakket ontvangen in Rotterdam", "Als ontvangen gemarkeerd")}
            >
              Ontvangen markeren
            </Button>
          </>
        )
      case "onderweg":
        return (
          <Button
            variant="primary"
            onClick={() => move({ status: "ontvangen" }, "Pakket ontvangen in Rotterdam", "Als ontvangen gemarkeerd")}
          >
            Ontvangen markeren
          </Button>
        )
      case "ontvangen":
        return (
          <Button
            variant="primary"
            onClick={() => move({ status: "klaar" }, "Gecontroleerd, in orde", "Gecontroleerd")}
          >
            Gecontroleerd, in orde
          </Button>
        )
      case "klaar":
        return (
          <Button
            variant="primary"
            onClick={() => {
              setResolution(r.requested)
              setAmountRaw(String(amountOf(r)).replace(".", ","))
              setDialog("resolve")
            }}
          >
            Afhandelen
          </Button>
        )
      case "afgewezen":
        return (
          <Button
            onClick={() =>
              move({ status: "te-beoordelen" }, "Opnieuw te beoordelen", `${r.number} staat weer bij Te beoordelen`)}
          >
            Opnieuw beoordelen
          </Button>
        )
      default:
        return null
    }
  })()

  const events = r.events.toReversed().map((e, i) => ({
    id: String(i),
    at: stamp(new Date(e.at)),
    title: (
      <>
        <span className="font-medium">{e.who}</span> · {e.text}
      </>
    ),
    ...(e.tone === undefined ? {} : { tone: e.tone === "accent" ? "neutral" as const : e.tone })
  }))

  return (
    <Page width="record">
      <PageHead
        title={`${r.kind === "claim" ? "Claim" : "Retour"} ${r.number}`}
        after={<Status tone={status.tone}>{status.label}</Status>}
        meta={
          <>
            <Link to={paths.customer(r.customerId)} className="text-ink-2 hover:underline">{who?.name}</Link>
            {" · bestelling "}
            <Link to={paths.order(r.orderNumber)} className="figure text-ink-2 hover:underline">#{r.orderNumber}</Link>
            {` · aangevraagd ${longDate(new Date(r.createdAt))}`}
          </>
        }
        actions={primary ?? undefined}
      />
      {!access.edit && <ReadOnlyNotice area="returns" />}

      {!win.inside && r.status === "te-beoordelen" && (
        <Notice tone="warn" title="Buiten de termijn">
          Bezorgd {win.day} dagen geleden; de termijn van {win.days} dagen sloot op {win.closes.getDate()}{" "}
          nov. Je kunt hem toch goedkeuren, of afwijzen met die reden.
        </Notice>
      )}
      {proposal !== undefined && r.status === "te-beoordelen" && (
        <PageSection title="Voorstel van de Retouragent" id="voorstel">
          <WaitingProposal item={proposal} primary={access.edit} />
          {proposalOpen && access.edit && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
              <span>Of beslis zelf:</span>
              <Button size="sm" variant="ghost" onClick={approve}>
                Toch terugbetalen: label sturen ({money(amountOf(r))})
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setDialog("reject")}
              >
                Afwijzen
              </Button>
            </div>
          )}
          {decided === "done" && (
            <p className="text-sm text-ink-2">
              Omruiling naar {r.exchangeTo ?? sizeUp(r.productId, r.size)} afgesproken. Keur de retour goed zodra{" "}
              {firstName} de S terugstuurt.
            </p>
          )}
        </PageSection>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          {r.status !== "afgewezen"
            ? (
              <Stepper
                label="Waar de retour is"
                current={STEP_AT[r.status]}
                stalled={overdue}
                steps={STEPS.map((step, i) => ({
                  label: step,
                  ...(i === 0
                    ? { detail: stamp(new Date(r.createdAt)) }
                    : i === 2 && r.label !== undefined
                    ? { detail: r.label.carrier }
                    : {})
                }))}
              />
            )
            : <Notice tone="info" title="Afgewezen">{r.rejectReason ?? "Zonder reden afgewezen."}</Notice>}

          <PageSection title="Wat terugkomt" id="artikel">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                <Link to={paths.product(r.productId)} className="font-medium hover:underline">
                  {p?.name ?? r.productId}
                </Link>
                {` · maat ${r.size} · ${r.qty}× `}
                <span className="figure">{money(r.unitPrice)}</span>
              </p>
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                <Fact label="Reden">{REASON_LABEL[r.reason]}</Fact>
                <Fact label="Wat de klant wil">{wishOf(r)}</Fact>
              </dl>
              {r.note !== "" && (
                <blockquote className="max-w-[62ch] rounded-md bg-well px-4 py-3 text-sm text-pretty text-ink-2">
                  “{r.note}”
                  <span className="mt-1 block text-xs text-ink-3">{who?.name}, in het retourportaal</span>
                </blockquote>
              )}
              {r.resolution !== undefined && (
                <p className="text-sm text-ink-2">
                  Afgehandeld met {RESOLUTION_LABEL[r.resolution.kind].toLowerCase()}
                  {r.resolution.kind === "terugbetalen" || r.resolution.kind === "cadeaubon"
                    ? (
                      <>
                        , <span className="figure">{money(r.resolution.amount)}</span>
                      </>
                    )
                    : ""} door {r.resolution.by}, {stamp(new Date(r.resolution.at))}.
                </p>
              )}
            </div>
          </PageSection>

          <PageSection title="Geschiedenis" id="geschiedenis">
            <Timeline label={`Geschiedenis van ${r.number}`} items={events} />
          </PageSection>
        </div>

        <aside aria-label="Over deze retour" className="flex min-w-0 flex-col gap-4">
          <dl className="flex flex-col gap-4">
            <Fact label="Bestelling">
              <Link to={paths.order(r.orderNumber)} className="figure font-medium hover:underline">
                #{r.orderNumber}
              </Link>
              {o !== undefined && (
                <span className="block text-ink-3">
                  {o.payment} · <span className="figure">{money(o.total)}</span>
                </span>
              )}
            </Fact>
            <Fact label="Klant">
              <Link to={paths.customer(r.customerId)} className="font-medium hover:underline">{who?.name}</Link>
              <span className="block truncate text-ink-3">{who?.email}</span>
            </Fact>
            <Fact label="Termijn">
              Dag {win.day} van {win.days}, {win.inside ? "sluit" : "sloot"} {win.closes.getDate()} nov
            </Fact>
            {r.status === "te-beoordelen" && (
              <Fact label="Beoordelen vóór">
                <span className={overdue ? "text-bad-ink" : undefined}>{stamp(new Date(deadlineOf(r)))}</span>
                {overdue && <span className="block text-ink-3">De {RETURN_SETTINGS.reviewHours} uur zijn voorbij</span>}
              </Fact>
            )}
            <Fact label="Toegewezen aan">
              <span className="flex flex-wrap items-baseline gap-x-2">
                {r.assignee ?? "Niemand"}
                {access.edit && r.status !== "afgehandeld" && (
                  <button
                    type="button"
                    className="text-xs text-ink-3 hover:text-ink hover:underline pointer-coarse:min-h-11"
                    onClick={() =>
                      r.assignee === ME.name
                        ? move({ assignee: undefined }, "Toewijzing weggehaald", "Toewijzing weggehaald")
                        : move({ assignee: ME.name }, `Toegewezen aan ${ME.name}`, `${r.number} is van jou`)}
                  >
                    {r.assignee === ME.name ? "Weghalen" : "Aan mij"}
                  </button>
                )}
              </span>
            </Fact>
            {r.label !== undefined && (
              <Fact label="Retourlabel">
                <span className="flex items-center gap-2.5">
                  <ServiceLogo service={r.label.carrier} name={r.label.carrier} size={28} />
                  <span className="min-w-0">
                    {r.label.carrier} <span className="figure">{r.label.tracking}</span>
                    <span className="block text-ink-3">
                      {r.label.sentAt === undefined
                        ? `Gemaakt ${stamp(new Date(r.label.madeAt))}, nog niet verstuurd`
                        : `Verstuurd ${stamp(new Date(r.label.sentAt))}`}
                    </span>
                  </span>
                </span>
              </Fact>
            )}
            <Fact label="Retouradres">
              <span className="text-pretty">
                {o?.storeId === "store_eu" || o === undefined ? RETURN_SETTINGS.address : RETURN_SETTINGS.addressAbroad}
              </span>
            </Fact>
          </dl>
          <Link to={paths.settings("retouren")} className="text-xs text-ink-3 hover:text-ink hover:underline">
            Retourinstellingen
          </Link>
        </aside>
      </div>

      <Dialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Retour afwijzen"
        description="De klant krijgt de reden in een mail. Afwijzen kun je ongedaan maken tot de mail vertrekt."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Annuleren</Button>
            <Button
              variant="danger"
              onClick={() => {
                const why = rejectOwn.trim() === "" ? rejectWhy : rejectOwn.trim()
                move(
                  { status: "afgewezen", rejectReason: why },
                  `Afgewezen: ${why}`,
                  `${r.number} afgewezen`,
                  "De mail vertrekt na de verzendtijd van 30 seconden."
                )
                setDialog(null)
              }}
            >
              Afwijzen
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <RadioGroup
            label="Reden"
            value={rejectWhy}
            onChange={setRejectWhy}
            options={REJECT_REASONS.map((x) => ({ value: x, label: x }))}
          />
          <Field label="Of in je eigen woorden" optional>
            {(c) => <Textarea {...c} rows={2} value={rejectOwn} onChange={(e) => setRejectOwn(e.target.value)} />}
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={dialog === "resolve"}
        onClose={() => setDialog(null)}
        title={`${r.number} afhandelen`}
        description={`Gecontroleerd en in orde. Wat krijgt ${who?.name ?? "de klant"}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Annuleren</Button>
            <Button
              variant="primary"
              disabled={over || !(amount > 0)}
              onClick={() => (chosen === "terugbetalen" ? setDialog("confirm-refund") : resolve())}
            >
              {chosen === "terugbetalen" ? `${money(amount)} terugbetalen` : RESOLUTION_LABEL[chosen]}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          <RadioGroup
            label="Afhandeling"
            value={chosen}
            onChange={(v) => setResolution(v as Resolution)}
            options={(Object.keys(RESOLUTION_LABEL) as ReadonlyArray<Resolution>).map((k) => ({
              value: k,
              label: k === r.requested ? `${RESOLUTION_LABEL[k]} (gevraagd)` : RESOLUTION_LABEL[k],
              description: `De klant krijgt ${RESOLUTION_DETAIL[k]}.`
            }))}
          />
          {chosen === "terugbetalen" && (
            <Field label="Bedrag" hint={`Hoogstens ${money(amountOf(r))}.`}>
              {(c) => (
                <Input
                  {...c}
                  prefix="€"
                  inputMode="decimal"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(e.target.value)}
                />
              )}
            </Field>
          )}
          {over && (
            <Notice tone="warn" title={`Je rol ${access.rol} mag tot ${money(limit ?? 0)} per bestelling terugbetalen`}>
              Kies een andere afhandeling, of vraag iemand van Financiën.
            </Notice>
          )}
        </div>
      </Dialog>

      <AlertDialog
        open={dialog === "confirm-refund"}
        onCancel={() => setDialog("resolve")}
        onConfirm={resolve}
        title={`${money(amount)} terugbetalen aan ${who?.name ?? "de klant"}?`}
        body={`Het geld gaat terug op de oorspronkelijke betaalmethode van #${r.orderNumber}. Na de verzendtijd van 30 seconden kan het niet meer worden teruggedraaid.${
          limit === null ? "" : ` Je rol ${access.rol} mag tot ${money(limit)} per bestelling terugbetalen.`
        }`}
        confirmLabel="Terugbetalen"
        cancelLabel="Terug"
      />
    </Page>
  )
}
