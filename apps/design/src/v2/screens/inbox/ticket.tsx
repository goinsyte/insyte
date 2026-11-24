import { useEffect, useRef, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { APPROVALS } from "../../fixtures/home.ts"
import {
  channelLabel,
  chaptersFor,
  proposedReply,
  replyWindow,
  statusUpdate,
  summaryOf,
  waited,
  waitedMinutes
} from "../../fixtures/inbox.ts"
import type { Ticket } from "../../fixtures/inbox.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths } from "../../router.tsx"
import { ReadOnlyNotice } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  AlertOctagon,
  Archive,
  ChevronLeft,
  Clock,
  Copy,
  CornerDownLeft,
  Edit,
  FileText,
  Inbox,
  Info,
  Mail,
  MoreHorizontal,
  Reply,
  Send,
  Star,
  Truck
} from "../../ui/icons.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Notice } from "../../ui/notice.tsx"
import { SEND_WINDOW_S } from "../../ui/proposal.tsx"
import { copyText } from "../../ui/share.tsx"
import { toast } from "../../ui/toast.tsx"
import { WaitingProposal } from "../waiting-proposal.tsx"
import { ForwardDialog } from "./compose.tsx"
import { AssignMenu, ChannelGlyph, EntryView, MY_KEY, ReplyBox, setStatus, StatusMenu } from "./parts.tsx"
import { customerName, TicketRecord } from "./record.tsx"
import { createTicket, dropEntries, nowClock, patchTicket, setSummary, useInboxState } from "./store.ts"

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
  const [forward, setForward] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>(undefined)
  const [draftOpen, setDraftOpen] = useState(true)
  const summary = useInboxState().summaries[t.number]
  const win = replyWindow(t)
  const mayWrite = !win.applies || win.can === "vrij"
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
                  <TitleField t={t} edit={edit} />
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
                  <IconButton
                    label={t.starred === true ? "Ster weghalen" : "Ster geven"}
                    pressed={t.starred === true}
                    className={t.starred === true ? "text-warn-ink" : undefined}
                    onClick={() => patchTicket(t.number, { starred: t.starred !== true })}
                  >
                    <Star fill={t.starred === true ? "currentColor" : "none"} />
                  </IconButton>
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
                    label={`${ASSISTANT} vragen`}
                    placement="bottom-end"
                    width="w-64"
                    trigger={(props) => (
                      <IconButton label={`${ASSISTANT} vragen`} className="pointer-coarse:size-11" {...props}>
                        <MagnusMark size={18} />
                      </IconButton>
                    )}
                  >
                    <DropdownLabel>{ASSISTANT}</DropdownLabel>
                    <DropdownItem
                      glyph={FileText}
                      onSelect={() => {
                        setSummary(t.number, summaryOf(t, name))
                      }}
                    >
                      Samenvatten
                    </DropdownItem>
                    <DropdownItem
                      glyph={Reply}
                      disabled={!edit || t.status === "klaar" || !mayWrite}
                      onSelect={() => {
                        setPrefill(t.draft ?? proposedReply(t, name))
                        setDraftOpen(false)
                        toast({
                          title: "Antwoord voorgesteld",
                          body: "Het staat in het antwoordveld; pas het aan voor je het verstuurt."
                        })
                      }}
                    >
                      Antwoord voorstellen
                    </DropdownItem>
                    <DropdownItem
                      glyph={Send}
                      disabled={!edit || t.status === "klaar" || !mayWrite}
                      onSelect={() => tellCustomer(t, name)}
                    >
                      Klant op de hoogte brengen
                    </DropdownItem>
                  </DropdownMenu>
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
                    <DropdownItem glyph={CornerDownLeft} onSelect={() => setForward(true)}>Doorsturen</DropdownItem>
                    <DropdownItem glyph={Copy} disabled={!edit} onSelect={() => duplicate(t)}>Dupliceren</DropdownItem>
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
                    <DropdownSeparator />
                    {(t.place ?? "inbox") === "inbox"
                      ? (
                        <>
                          <DropdownItem glyph={Archive} disabled={!edit} onSelect={() => move(t, "archief", back)}>
                            Archiveren
                          </DropdownItem>
                          <DropdownItem glyph={AlertOctagon} disabled={!edit} onSelect={() => move(t, "spam", back)}>
                            Melden als spam
                          </DropdownItem>
                        </>
                      )
                      : (
                        <DropdownItem glyph={Inbox} disabled={!edit} onSelect={() => move(t, "inbox", back)}>
                          Terug naar de inbox
                        </DropdownItem>
                      )}
                  </DropdownMenu>
                </div>
              </div>
            </header>

            {!edit && <ReadOnlyNotice area="support" />}

            {t.place !== undefined && t.place !== "inbox" && (
              <Notice
                tone="info"
                title={t.place === "spam" ? "Gemeld als spam" : "Gearchiveerd"}
                action={edit && (
                  <Button size="sm" icon={<Inbox />} onClick={() => move(t, "inbox", back)}>
                    Terug naar de inbox
                  </Button>
                )}
              >
                {t.place === "spam"
                  ? "Nieuwe berichten van deze afzender komen niet meer in de inbox."
                  : "Het gesprek staat niet meer in de inbox. Schrijft de klant terug, dan komt het vanzelf terug."}
              </Notice>
            )}

            {summary !== undefined && (
              <section aria-label="Samenvatting" className="flex flex-col gap-2 rounded-lg bg-well p-4">
                <p className="flex items-center gap-2 text-xs font-medium text-ink-2">
                  <MagnusMark size={16} />
                  Samenvatting van {ASSISTANT}
                </p>
                <p className="max-w-[62ch] text-sm leading-6 text-pretty text-ink">{summary}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Copy />}
                    onClick={() => {
                      void copyText(summary)
                      toast({ title: "Samenvatting gekopieerd" })
                    }}
                  >
                    Kopiëren
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSummary(t.number, undefined)}
                  >
                    Verbergen
                  </Button>
                </div>
              </section>
            )}

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

            {approval === undefined && t.draft !== undefined && draftOpen && edit && t.status !== "klaar" && mayWrite &&
              (
                <Draft
                  t={t}
                  onUse={(text) => {
                    setPrefill(text)
                    setDraftOpen(false)
                  }}
                  onDismiss={() => setDraftOpen(false)}
                />
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
      <ForwardDialog t={t} open={forward} onClose={() => setForward(false)} />
    </div>
  )
}

/** The subject, edited in place: a press on it, Enter or leaving the field saves, Escape keeps the old one. */
function TitleField({ t, edit }: { readonly t: Ticket; readonly edit: boolean }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(t.subject)
  const done = useRef(false)
  if (!edit) return <h1 className="text-xl font-semibold text-balance text-ink">{t.subject}</h1>
  if (!editing) {
    return (
      <h1 className="text-xl font-semibold text-balance text-ink">
        <button
          type="button"
          title="Titel wijzigen"
          onClick={() => {
            setValue(t.subject)
            done.current = false
            setEditing(true)
          }}
          className="group -mx-1 inline-flex items-center gap-2 rounded-sm px-1 text-left hover:bg-hover"
        >
          {t.subject}
          <Edit
            size={14}
            className="shrink-0 text-ink-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </button>
      </h1>
    )
  }
  const save = () => {
    if (done.current) return
    done.current = true
    setEditing(false)
    const next = value.trim()
    if (next === "" || next === t.subject) return
    const before = t.subject
    patchTicket(t.number, { subject: next })
    toast({
      title: "Titel gewijzigd",
      action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { subject: before }) }
    })
  }
  return (
    <input
      aria-label="Titel"
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === "Enter") save()
        if (event.key === "Escape") {
          done.current = true
          setEditing(false)
        }
      }}
      className="-mx-1 h-8 w-full min-w-64 rounded-sm bg-canvas px-1 text-xl font-semibold text-ink ring-1 ring-line-strong outline-none focus:ring-ink-4"
    />
  )
}

/**
 * Magnus's draft, with what it was written from: the order or the customer, and the Kennisbank
 * chapters it answered out of (each a link to that chapter). Rewritten warmer or shorter on request;
 * "Concept gebruiken" puts the version on screen into the reply box.
 */
function Draft({ t, onUse, onDismiss }: {
  readonly t: Ticket
  readonly onUse: (text: string) => void
  readonly onDismiss: () => void
}) {
  const [version, setVersion] = useState<"origineel" | "warmer" | "korter">("origineel")
  const [busy, setBusy] = useState<"warmer" | "korter" | undefined>(undefined)
  const text = version === "origineel" || t.rewrites === undefined ? t.draft ?? "" : t.rewrites[version]
  const chapters = chaptersFor(t)
  const rewrite = (to: "warmer" | "korter") => {
    setBusy(to)
    globalThis.setTimeout(() => {
      setBusy(undefined)
      setVersion(to)
      toast({
        title: `Herschreven · ${to}`,
        action: { label: "Ongedaan maken", onClick: () => setVersion(version) }
      })
    }, 700)
  }
  return (
    <section aria-label={`Concept van ${ASSISTANT}`} className="flex flex-col gap-2.5 rounded-lg bg-well p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-ink-2">
        <MagnusMark size={16} />
        {ASSISTANT} stelde een antwoord op
        {version !== "origineel" && <span className="font-normal text-ink-3">· {version}</span>}
      </p>
      <p
        className={cx(
          "max-w-[62ch] text-sm leading-6 text-pretty text-ink transition-opacity",
          busy !== undefined && "opacity-50"
        )}
        aria-busy={busy !== undefined}
      >
        {text}
      </p>
      <p className="flex flex-wrap items-center gap-x-1.5 text-2xs text-ink-3">
        <span>Gelezen: {t.order === undefined ? "klantprofiel" : `bestelling #${t.order}`} · Northwind-toon</span>
        {chapters.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>Uit de kennisbank:</span>
            {chapters.map((c, i) => (
              <span key={c.id}>
                <Link
                  to={paths.settings(`ai/kennisbank/${c.id}`)}
                  className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
                >
                  {c.title}
                </Link>
                {i < chapters.length - 1 ? "," : ""}
              </span>
            ))}
          </>
        )}
      </p>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <Button size="sm" variant="primary" disabled={busy !== undefined} onClick={() => onUse(text)}>
          Concept gebruiken
        </Button>
        {t.rewrites !== undefined && (
          <>
            <Button
              size="sm"
              disabled={busy !== undefined || version === "warmer"}
              loading={busy === "warmer"}
              onClick={() => rewrite("warmer")}
            >
              Warmer maken
            </Button>
            <Button
              size="sm"
              disabled={busy !== undefined || version === "korter"}
              loading={busy === "korter"}
              onClick={() => rewrite("korter")}
            >
              Korter maken
            </Button>
          </>
        )}
        <Button size="sm" variant="ghost" onClick={onDismiss}>Negeren</Button>
      </div>
    </section>
  )
}

/** Move a conversation to the archive or spam (and on to the list), or back into the inbox. */
function move(t: Ticket, to: "inbox" | "archief" | "spam", back: string) {
  const before = t.place ?? "inbox"
  if (before === to) return
  patchTicket(t.number, { place: to })
  if (to !== "inbox") navigate(back)
  toast({
    title: to === "archief"
      ? `#${t.number} gearchiveerd`
      : to === "spam"
      ? `#${t.number} gemeld als spam`
      : `#${t.number} terug in de inbox`,
    action: {
      label: "Ongedaan maken",
      onClick: () => {
        patchTicket(t.number, { place: before })
        if (to !== "inbox") navigate(paths.ticket(t.number))
      }
    }
  })
}

/** A copy of the ticket to work on apart: the same customer, fields and labels, with a line where it came from. */
function duplicate(t: Ticket) {
  const number = createTicket({
    customerId: t.customerId,
    handle: t.handle,
    subject: `${t.subject} (kopie)`,
    channel: t.channel,
    status: t.status === "klaar" ? "bezig" : t.status,
    priority: t.priority,
    assignee: t.assignee,
    labels: t.labels,
    ...(t.order === undefined ? {} : { order: t.order }),
    ...(t.also === undefined ? {} : { also: t.also }),
    createdAt: nowClock(),
    unread: false,
    entries: [{ kind: "event", at: nowClock(), text: `Elena Hart maakte dit ticket als kopie van #${t.number}.` }]
  })
  toast({
    title: `Kopie gemaakt: #${number}`,
    tone: "good",
    action: { label: "Openen", onClick: () => navigate(paths.ticket(number)) }
  })
}

/** Send the customer where it stands, in one short message, and wait for their answer. */
function tellCustomer(t: Ticket, name: string) {
  const before = { status: t.status, waitingSince: t.waitingSince }
  patchTicket(t.number, {
    entries: [
      { kind: "team", who: MY_KEY, at: nowClock(), text: statusUpdate(t, name) },
      { kind: "event", at: nowClock(), text: "Klant bijgepraat over de stand van zaken. Wacht op antwoord." }
    ],
    status: "wacht",
    answered: true
  })
  toast({
    title: `Wordt over ${SEND_WINDOW_S} s verstuurd`,
    body: `Een update via ${channelLabel(t.channel)} aan ${name}; het ticket wacht op antwoord.`,
    duration: SEND_WINDOW_S * 1000,
    action: {
      label: "Niet versturen",
      onClick: () => {
        dropEntries(t.number, 2)
        patchTicket(t.number, { status: before.status, answered: before.waitingSince === undefined })
      }
    }
  })
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
