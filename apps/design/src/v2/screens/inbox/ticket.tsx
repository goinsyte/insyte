import { useEffect, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import { channelLabel, waited, waitedMinutes } from "../../fixtures/inbox.ts"
import type { Ticket } from "../../fixtures/inbox.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate } from "../../router.tsx"
import { ReadOnlyNotice } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { Archive, ChevronLeft, Clock, Copy, Info, Mail, MoreHorizontal, Truck } from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Notice } from "../../ui/notice.tsx"
import { copyText } from "../../ui/share.tsx"
import { toast } from "../../ui/toast.tsx"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { AssignMenu, ChannelGlyph, EntryView, MY_KEY, ReplyBox, setStatus, StatusMenu } from "./parts.tsx"
import { customerName, TicketRecord } from "./record.tsx"
import { nowClock, patchTicket } from "./store.ts"

/**
 * One ticket: the conversation with the customer in the order it happened (their mails, the team's
 * answers, what the agents did, the internal notes), what waits on a decision (an agent's proposal,
 * a refund a colleague asked you to approve, Magnus's concept), and the reply box at the foot. The
 * record side (customer, order, the ticket's fields) sits beside it on a wide screen and in a sheet
 * on a narrow one. The current demo's ticket modal and inbox letter, as one page.
 */
export function TicketDetail({ t, all, edit, back }: {
  readonly t: Ticket
  readonly all: ReadonlyArray<Ticket>
  readonly edit: boolean
  /** Where "terug" goes on a phone: the list with its filters. */
  readonly back: string
}) {
  const name = customerName(t)
  const [details, setDetails] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>(undefined)
  const [draftOpen, setDraftOpen] = useState(true)
  const approval = APPROVALS.find((a) => a.id === t.approvalId)
  const others = all.filter((x) => x.customerId === t.customerId && x.number !== t.number)
  const mins = waitedMinutes(t)

  useEffect(() => {
    if (t.unread) patchTicket(t.number, { unread: false })
  }, [t.number, t.unread])

  const record = <TicketRecord t={t} others={others} edit={edit} />

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="pane-scroll min-h-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-4 pb-8 sm:px-8 sm:pt-6">
            <header className="flex flex-col gap-3">
              <Link
                to={back}
                className="-ml-1 inline-flex h-8 items-center gap-1 self-start rounded-sm px-1 text-sm text-ink-2 hover:bg-hover hover:text-ink md:hidden pointer-coarse:h-11"
              >
                <ChevronLeft size={16} />
                Inbox
              </Link>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <h1 className="text-xl font-semibold text-balance text-ink">{t.subject}</h1>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-3">
                    <span className="figure">#{t.number}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-ink-2">{name}</span>
                    <span>via</span>
                    <ChannelGlyph channel={t.channel} size={14} />
                    <span>{channelLabel(t.channel)}</span>
                    {mins !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={mins > 240 ? "font-medium text-warn-ink" : undefined}>
                          wacht <span className="figure">{waited(mins)}</span>
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <StatusMenu t={t} disabled={!edit} />
                  <AssignMenu t={t} disabled={!edit} compact />
                  <IconButton
                    label="Details"
                    className="xl:hidden pointer-coarse:size-11"
                    onClick={() => setDetails(true)}
                  >
                    <Info />
                  </IconButton>
                  <DropdownMenu
                    label="Meer acties"
                    placement="bottom-end"
                    width="w-60"
                    trigger={(props) => (
                      <IconButton label="Meer acties" className="pointer-coarse:size-11" {...props}>
                        <MoreHorizontal />
                      </IconButton>
                    )}
                  >
                    <DropdownItem
                      glyph={Copy}
                      onSelect={() => {
                        void copyText(`#${t.number}`)
                        toast({ title: "Ticketnummer gekopieerd", body: `#${t.number}` })
                      }}
                    >
                      Ticketnummer kopiëren
                    </DropdownItem>
                    <DropdownItem
                      glyph={Mail}
                      onSelect={() => {
                        patchTicket(t.number, { unread: true })
                        navigate(back)
                      }}
                    >
                      Markeren als ongelezen
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem
                      glyph={Clock}
                      disabled={!edit}
                      onSelect={() => {
                        const before = t.status
                        patchTicket(t.number, { status: "wacht" })
                        toast({
                          title: `#${t.number} uitgesteld tot morgen 9:00`,
                          body: "Hij staat zolang bij Wacht op antwoord.",
                          action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { status: before }) }
                        })
                      }}
                    >
                      Uitstellen tot morgen
                    </DropdownItem>
                    <DropdownItem
                      glyph={Archive}
                      disabled={!edit || t.status === "klaar"}
                      onSelect={() => setStatus(t, "klaar")}
                    >
                      Afronden
                    </DropdownItem>
                  </DropdownMenu>
                </div>
              </div>
            </header>

            {!edit && <ReadOnlyNotice area="support" />}

            {t.deadline !== undefined && t.status !== "klaar" && (
              <Notice
                tone="warn"
                title={`${t.deadline.text}`}
                action={edit && (
                  <Button
                    size="sm"
                    icon={<Truck />}
                    onClick={() => {
                      patchTicket(t.number, {
                        entries: [{
                          kind: "event",
                          at: nowClock(),
                          text: "Elena Hart startte een claim bij DPD voor #5263."
                        }]
                      })
                      toast({
                        title: "Claim bij DPD gestart",
                        body: "Bestelling #5263 · DPD bevestigt binnen een werkdag.",
                        tone: "good"
                      })
                    }}
                  >
                    Claim bij DPD starten
                  </Button>
                )}
              >
                Het pakket van bestelling #5263 staat sinds 18 nov als zoek. Na 17:00 loopt een claim via hun
                klantenservice en duurt het weken.
              </Notice>
            )}

            {t.typing !== undefined && (
              <p className="flex items-center gap-2 text-sm text-ink-2" role="status">
                <Avatar name={PEOPLE[t.typing].name} size={20} presence="online" />
                <span>
                  <span className="font-medium text-ink">{PEOPLE[t.typing].name}</span> schrijft nu een antwoord
                </span>
                <span className="flex gap-0.5" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="size-1 animate-pulse rounded-full bg-ink-3 motion-reduce:animate-none"
                      style={{ animationDelay: `${i * 160}ms` }}
                    />
                  ))}
                </span>
              </p>
            )}

            <section aria-label="Gesprek">
              <ol className="flex flex-col gap-6">
                {t.entries.map((entry, i) => <EntryView key={i} entry={entry} customer={name} />)}
              </ol>
            </section>

            {t.number === "5142" && <RefundDecision t={t} edit={edit} />}

            {approval !== undefined && (
              <section aria-label="Voorstel" className="rounded-lg bg-well p-4">
                <WaitingProposal item={approval} primary />
              </section>
            )}

            {approval === undefined && t.draft !== undefined && draftOpen && edit && t.status !== "klaar" && (
              <section aria-label={`Concept van ${ASSISTANT}`} className="flex flex-col gap-2.5 rounded-lg bg-well p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-ink-2">
                  <MagnusMark size={16} />
                  {ASSISTANT} stelde een antwoord op
                </p>
                <p className="max-w-[62ch] text-sm leading-6 text-pretty text-ink">{t.draft}</p>
                <p className="text-2xs text-ink-3">
                  Gelezen: {t.order === undefined ? "klantprofiel" : `bestelling #${t.order}`}{" "}
                  · verzendbeleid · Northwind-toon
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setPrefill(t.draft)
                      setDraftOpen(false)
                    }}
                  >
                    Concept gebruiken
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraftOpen(false)}
                  >
                    Negeren
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>

        {edit && t.status !== "klaar" && (
          <div className="shrink-0 px-4 pb-4 sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              <ReplyBox t={t} customer={name} prefill={prefill} />
            </div>
          </div>
        )}
        {edit && t.status === "klaar" && (
          <div className="shrink-0 px-4 pb-4 sm:px-8">
            <p className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">
              Dit ticket is klaar.
              <Button size="sm" onClick={() => setStatus(t, "bezig")}>Heropenen</Button>
            </p>
          </div>
        )}
      </div>

      <aside
        aria-label="Klant en bestelling"
        className="pane-scroll hidden w-72 shrink-0 bg-panel px-5 py-6 xl:block"
      >
        {record}
      </aside>

      <Sheet open={details} onClose={() => setDetails(false)} title={`Ticket #${t.number}`} meta={name}>
        {record}
      </Sheet>
    </div>
  )
}

/**
 * The decision Sofía asked Elena for in #5142: a refund outside the returns policy. Approving it is a
 * person's call (an agent never refunds); it lands in the conversation as a note and can be undone.
 */
function RefundDecision({ t, edit }: { readonly t: Ticket; readonly edit: boolean }) {
  const decided = t.entries.some((e) => e.kind === "note" && e.who === MY_KEY && e.text.startsWith("Terugbetaling"))
  if (decided || !edit) return null
  const decide = (yes: boolean) => {
    patchTicket(t.number, {
      entries: [{
        kind: "note",
        who: MY_KEY,
        at: nowClock(),
        text: yes
          ? "Terugbetaling van € 45,40 goedgekeurd. @Sofía je kunt Liam laten weten dat het geld binnen 3 werkdagen terug is."
          : "Terugbetaling afgewezen: sale-artikelen ruilen we om. @Sofía bied Liam een omruiling naar M aan."
      }]
    })
    toast({
      title: yes ? "Terugbetaling goedgekeurd" : "Terugbetaling afgewezen",
      body: "Sofía Kim krijgt een melding.",
      tone: yes ? "good" : "neutral"
    })
  }
  return (
    <section aria-label="Gevraagd aan jou" className="flex flex-col gap-2 rounded-lg bg-accent-tint p-4">
      <p className="text-sm font-semibold text-ink">Sofía Kim vraagt jou de terugbetaling goed te keuren</p>
      <p className="text-sm text-pretty text-ink-2">
        € 45,40 voor de Heartland Henley uit #5297. Sale-artikelen zijn volgens het retourbeleid niet retourneerbaar;
        Liam is vaste klant met 7 bestellingen.
      </p>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button size="sm" variant="primary" onClick={() => decide(true)}>Goedkeuren</Button>
        <Button size="sm" onClick={() => decide(false)}>Afwijzen</Button>
      </div>
    </section>
  )
}
