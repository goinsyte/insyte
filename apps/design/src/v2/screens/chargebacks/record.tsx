import { useState } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import {
  CASE_STATUS,
  casesNow,
  changeCase,
  CHANNEL_LABEL,
  findCase,
  restoreCases,
  timeLeft,
  useCases
} from "../../fixtures/chargebacks.ts"
import { longDate, money, stamp } from "../../fixtures/order-desk.ts"
import { customer, order, product } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { undoable } from "../../ui/acts.ts"
import { AgentAvatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { LoadError, RecordSkeleton } from "../../ui/data.tsx"
import { AlertDialog } from "../../ui/dialog.tsx"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import { CreditCard } from "../../ui/icons.tsx"
import { Field, Textarea } from "../../ui/input.tsx"
import { Fact } from "../../ui/key-value.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Timeline } from "../../ui/timeline.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, useView } from "../../view.ts"
import { dueText } from "./list.tsx"

/*
 * One chargeback (`/app`'s `chargebacks/$id`, `chargeback-screen.tsx`): what the customer told the
 * provider, the evidence pack and the answer, and the deadline. Sending it to the provider cannot be
 * taken back (the provider judges what it gets), so it confirms in an AlertDialog and has no undo;
 * the pack itself can be changed freely until then.
 */

export function ChargebackRecord({ id }: { readonly id: string }) {
  const view = useView()
  const access = useAccess("chargebacks")
  const state = dataState(view)
  const s = useCases()
  const c = findCase(id, s)
  const [dialog, setDialog] = useState<"submit" | "accept" | null>(null)

  if (!access.view) {
    return (
      <Page width="record">
        <Denied area="chargebacks" what="deze chargeback" />
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
        <LoadError one what="De zaak" detail={`GET /disputes/${id} · 502 · req_4fa210`} />
      </Page>
    )
  }
  if (c === undefined || state === "empty") {
    return (
      <Page width="record">
        <PageHead title={id.toUpperCase()} />
        <EmptyState
          glyph={CreditCard}
          title="Deze zaak bestaat niet"
          action={<ButtonLink to={paths.chargebacks}>Naar chargebacks</ButtonLink>}
        >
          Er is geen chargeback met nummer{" "}
          {id.toUpperCase()}. Een chargeback komt hier binnen zodra een aanbieder er een opent.
        </EmptyState>
      </Page>
    )
  }

  const who = customer(c.customerId)
  const o = c.linked ? order(c.orderNumber) : undefined
  const channel = CHANNEL_LABEL[c.channel]
  const open = c.status === "wacht-op-bewijs"
  const editable = open && access.edit
  const agent = c.draftedBy === undefined ? undefined : AGENTS.find((a) => a.id === c.draftedBy?.agentId)
  const ready = c.files.length > 0 && c.statement.trim() !== ""
  const urgent = open && c.dueAt - casesNow() < 48 * 3_600_000

  const submit = () => {
    changeCase(c.id, (cur) => ({
      status: "ingediend",
      events: [...cur.events, {
        at: casesNow(),
        who: ME.name,
        text: `Bewijs ingediend bij ${channel}: ${cur.files.length} documenten en het verweer`
      }]
    }))
    setDialog(null)
    toast({ title: `Ingediend bij ${channel}`, body: "De uitspraak komt meestal binnen 30 dagen.", tone: "good" })
  }
  const accept = () => {
    const before = changeCase(c.id, (cur) => ({
      status: "verloren",
      events: [...cur.events, {
        at: casesNow(),
        who: ME.name,
        text: `Geaccepteerd; ${money(cur.amount)} terug naar ${who?.name ?? "de klant"}`,
        tone: "bad"
      }]
    }))
    setDialog(null)
    undoable(
      `${c.id} geaccepteerd als verloren`,
      () => restoreCases(before),
      "Ongedaan maken kan de komende 30 seconden."
    )
  }
  const removeFile = (fileId: string) => {
    const file = c.files.find((f) => f.id === fileId)
    const before = changeCase(c.id, (cur) => ({ files: cur.files.filter((f) => f.id !== fileId) }))
    undoable(`${file?.name ?? "Document"} weggehaald`, () => restoreCases(before))
  }
  const addFiles = (files: ReadonlyArray<File>) => {
    changeCase(c.id, (cur) => ({
      files: [
        ...cur.files,
        ...files.map((f, i) => ({
          id: `u${casesNow()}-${i}`,
          name: f.name,
          bytes: f.size,
          what: `Toegevoegd door ${ME.name}`
        }))
      ],
      events: [...cur.events, {
        at: casesNow(),
        who: ME.name,
        text: files.length === 1
          ? `${files[0]?.name ?? "Document"} toegevoegd`
          : `${files.length} documenten toegevoegd`
      }]
    }))
    toast({ title: files.length === 1 ? "Document toegevoegd" : `${files.length} documenten toegevoegd`, tone: "good" })
  }

  const actions = open
    ? access.manage
      ? (
        <>
          <Button variant="ghost" onClick={() => setDialog("accept")}>Accepteren</Button>
          <Button variant="primary" disabled={!ready} onClick={() => setDialog("submit")}>
            Indienen bij {channel}
          </Button>
        </>
      )
      : undefined
    : undefined

  return (
    <Page width="record">
      <PageHead
        title={c.id}
        after={<Status tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</Status>}
        meta={
          <>
            <ServiceLogo service={c.channel} name={channel} size={16} className="mr-1.5 align-text-bottom" />
            {channel} · <span className="figure">{money(c.amount)}</span> · bestelling {o !== undefined
              ? (
                <Link to={paths.order(c.orderNumber)} className="figure text-ink-2 hover:underline">
                  #{c.orderNumber}
                </Link>
              )
              : <span className="figure">#{c.orderNumber}</span>}
            {" · "}
            <Link to={paths.customer(c.customerId)} className="text-ink-2 hover:underline">
              {who?.name ?? c.customerId}
            </Link>
          </>
        }
        actions={actions}
      />
      {!access.edit && <ReadOnlyNotice area="chargebacks" />}
      {open && access.edit && !access.manage && (
        <Denied area="chargebacks" need={3} what="dit indienen of accepteren" size="section" />
      )}

      {open && (
        <Notice
          tone={urgent ? "bad" : "warn"}
          title={`Antwoorden vóór ${dueText(c.dueAt)}, ${timeLeft(c.dueAt)}`}
        >
          {c.draftedBy !== undefined
            ? "Controleer wat is toegevoegd en dien het dan in. Er gaat niets naar de aanbieder tot je dat doet."
            : `Zonder bewijs vóór de deadline beslist ${channel} in het voordeel van de klant en gaat ${
              money(c.amount)
            } terug.`}
        </Notice>
      )}
      {c.status === "ingediend" && (
        <Notice tone="info" title={`Ingediend bij ${channel}`}>
          De uitspraak komt meestal binnen 30 dagen. Je kunt niets meer toevoegen.
        </Notice>
      )}
      {c.status === "gewonnen" && (
        <Notice tone="good" title="Gewonnen">
          {channel} besliste in het voordeel van Northwind; het bedrag blijft van jou.
        </Notice>
      )}
      {c.status === "verloren" && (
        <Notice tone="bad" title="Verloren">{money(c.amount)} is teruggegaan naar {who?.name ?? "de klant"}.</Notice>
      )}

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex min-w-0 flex-col gap-10">
          <PageSection title="Wat de klant zegt" id="claim" meta={c.reason}>
            <blockquote className="max-w-[62ch] rounded-md bg-well px-4 py-3 text-sm text-pretty text-ink-2">
              “{c.claim}”
              <span className="mt-1 block text-xs text-ink-3">
                {who?.name}, via {channel} op {longDate(new Date(c.openedAt))}
              </span>
            </blockquote>
          </PageSection>

          <PageSection
            title="Bewijspakket"
            id="bewijs"
            meta={c.files.length === 1 ? "1 document" : `${c.files.length} documenten`}
          >
            {c.draftedBy !== undefined && (
              <p className="flex items-center gap-2 text-sm text-ink-2">
                {agent !== undefined && <AgentAvatar glyph={agent.glyph} size={20} />}
                <span>
                  Opgesteld door de{" "}
                  <Link to={paths.agent(c.draftedBy.agentId)} className="text-ink hover:underline">
                    {c.draftedBy.agent}
                  </Link>{" "}
                  om{" "}
                  <span className="figure">{stamp(new Date(c.draftedBy.at)).split(" ").at(-1)}</span>, uit de
                  bestelling, de vervoerder en de mails.
                </span>
              </p>
            )}
            {c.files.length === 0
              ? (
                <p className="text-sm text-ink-3">
                  Nog geen documenten. Een bezorgbewijs en de bestelbevestiging wegen het zwaarst.
                </p>
              )
              : (
                <ul className="flex flex-col gap-2">
                  {c.files.map((f) => (
                    <li key={f.id} className="flex flex-col gap-0.5">
                      <FileRow
                        name={f.name}
                        bytes={f.bytes}
                        state={{ kind: "done" }}
                        {...(editable
                          ? { onRemove: () => removeFile(f.id) }
                          : {})}
                      />
                      <span className="pl-1 text-xs text-ink-3">{f.what}</span>
                    </li>
                  ))}
                </ul>
              )}
            {editable && (
              <FileDrop
                onFiles={addFiles}
                accept=".pdf,.png,.jpg,.jpeg"
                hint="PDF of afbeelding, tot 10 MB per bestand"
              />
            )}
          </PageSection>

          <PageSection title="Verweer" id="verweer" meta={`Aan ${channel}`}>
            {editable
              ? (
                <Field
                  label="Wat je tegen de klacht inbrengt"
                  hint={`${channel} leest dit bij de documenten. Schrijf de feiten, met data en tijden.`}
                >
                  {(f) => (
                    <Textarea
                      {...f}
                      rows={6}
                      value={c.statement}
                      onChange={(e) => {
                        const text = e.target.value
                        changeCase(c.id, () => ({ statement: text }))
                      }}
                    />
                  )}
                </Field>
              )
              : (
                <p className="max-w-[68ch] text-sm text-pretty text-ink-2">
                  {c.statement === "" ? "Er is geen verweer geschreven." : c.statement}
                </p>
              )}
          </PageSection>

          <PageSection title="Geschiedenis" id="geschiedenis">
            <Timeline
              label={`Geschiedenis van ${c.id}`}
              items={c.events.toReversed().map((e, i) => ({
                id: String(i),
                at: stamp(new Date(e.at)),
                title: (
                  <>
                    <span className="font-medium">{e.who}</span> · {e.text}
                  </>
                ),
                ...(e.tone === undefined ? {} : { tone: e.tone === "accent" ? "neutral" as const : e.tone })
              }))}
            />
          </PageSection>
        </div>

        <aside aria-label="Over deze zaak" className="flex min-w-0 flex-col gap-4">
          <dl className="flex flex-col gap-4">
            <Fact label="Bestelling">
              {o !== undefined
                ? (
                  <>
                    <Link to={paths.order(c.orderNumber)} className="figure font-medium hover:underline">
                      #{c.orderNumber}
                    </Link>
                    <span className="block text-ink-3">
                      {o.lines.map((l) => `${product(l.productId)?.name ?? l.productId} · ${l.size}`).join(", ")}
                    </span>
                    <span className="block text-ink-3">{o.carrier} · {o.payment}</span>
                  </>
                )
                : (
                  <>
                    <span className="figure">#{c.orderNumber}</span>
                    <span className="block text-ink-3">Ouder dan de demo; niet te openen</span>
                  </>
                )}
            </Fact>
            <Fact label="Klant">
              <Link to={paths.customer(c.customerId)} className="font-medium hover:underline">
                {who?.name ?? c.customerId}
              </Link>
              <span className="block truncate text-ink-3">{who?.email}</span>
            </Fact>
            <Fact label="Betwist bedrag">
              <span className="figure">{money(c.amount)}</span> via {channel}
            </Fact>
            <Fact label="Geopend">{longDate(new Date(c.openedAt))}</Fact>
            <Fact label="Deadline">
              <span className={urgent ? "text-bad-ink" : undefined}>{longDate(new Date(c.dueAt))}</span>
              {open && <span className="block text-ink-3">{timeLeft(c.dueAt)}</span>}
            </Fact>
          </dl>
        </aside>
      </div>

      <AlertDialog
        open={dialog === "submit"}
        onCancel={() => setDialog(null)}
        onConfirm={submit}
        title={`${c.files.length === 1 ? "1 document" : `${c.files.length} documenten`} indienen bij ${channel}?`}
        body={`${channel} beoordeelt wat je stuurt zoals het is; je kunt daarna niets meer toevoegen. Er wordt ${
          money(c.amount)
        } betwist.`}
        confirmLabel={`Indienen bij ${channel}`}
        cancelLabel="Nog niet"
      />
      <AlertDialog
        open={dialog === "accept"}
        onCancel={() => setDialog(null)}
        onConfirm={accept}
        title="Geschil accepteren?"
        body={`${money(c.amount)} gaat terug naar ${
          who?.name ?? "de klant"
        } en de zaak sluit als verloren. Na de verzendtijd van 30 seconden kan dit niet ongedaan worden gemaakt.`}
        confirmLabel="Accepteren en terugbetalen"
        cancelLabel="Niet accepteren"
      />
    </Page>
  )
}
