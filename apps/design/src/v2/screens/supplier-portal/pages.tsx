import { useEffect, useRef, useState } from "react"
import {
  allureStatements,
  BRAND,
  BRAND_LEGAL,
  CHANNEL,
  CHAT_PEOPLE,
  COURSES,
  ME,
  NOTIFY_ROWS,
  PLATFORMS,
  STATEMENT_STATUS,
  supplierNotes
} from "../../fixtures/supplier-portal.ts"
import type { Platform, Statement } from "../../fixtures/supplier-portal.ts"
import { DEMO_NOW } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, useQuery } from "../../router.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { RadioGroup } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { FileDrop } from "../../ui/file-drop.tsx"
import {
  Bell,
  Check,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  MessagesSquare,
  Send,
  ShoppingBag,
  Wallet
} from "../../ui/icons.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Message } from "../../ui/message.tsx"
import { NotificationList } from "../../ui/notifications.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { ProgressBar } from "../../ui/progress.tsx"
import { Rich } from "../../ui/rich.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { SkeletonRow } from "../../ui/skeleton.tsx"
import { EmptyState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import {
  count,
  day,
  dayFull,
  dayLong,
  dayMonth,
  Figures,
  FiguresSkeleton,
  LoadError,
  money,
  plural,
  saveFile,
  TableSkeleton,
  time,
  useDataState
} from "./parts.tsx"
import { changeWithUndo, setSupplier, useSupplier } from "./store.ts"

const Rows = ({ n = 5 }: { readonly n?: number }) => (
  <div aria-busy="true" className="flex flex-col">{Array.from({ length: n }, (_, i) => <SkeletonRow key={i} />)}</div>
)

/* ── chat ─────────────────────────────────────────────────────────────────────────────────────── */

const QUICK = [
  "Ligt klaar, gaat vandaag mee met de ophaling.",
  "Komt binnen met de nieuwe batch, ik meld het zodra het binnen is.",
  "Kun je het adres bij de klant navragen?"
]

/*
 * The supplier's one conversation with Northwind: the brand's #allure-fulfillment channel, read by
 * the team there. Opening it marks the last message read; a question about an order arrives with its number.
 */
export function ChatPage() {
  const state = useDataState()
  const { chat, chatRead } = useSupplier()
  const about = useQuery("over")
  const [draft, setDraft] = useState(about === null ? "" : `Over #${about}: `)
  const end = useRef<HTMLDivElement>(null)
  const messages = state === "empty" ? [] : chat

  useEffect(() => {
    if (!chatRead && state === "ready") setSupplier((s) => ({ ...s, chatRead: true }))
  }, [chatRead, state])
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const send = (body: string) => {
    const text = body.trim()
    if (text === "") return
    setSupplier((s) => ({
      ...s,
      chat: [...s.chat, { id: `m${s.chat.length + 1}`, from: "marco", body: text, at: DEMO_NOW.date }]
    }))
    setDraft("")
    toast({ title: `Verstuurd naar ${BRAND}`, body: `In ${CHANNEL}` })
  }

  return (
    <Page width="text">
      <PageHead title={`Chat met ${BRAND}`} meta={`Elena Hart en Sofía Kim lezen mee in ${CHANNEL}`} />
      {state === "loading" ? <Rows /> : state === "error" ?
        <LoadError what="De chat" /> :
        (
          <div className="flex flex-col gap-6">
            {messages.length === 0 ?
              (
                <EmptyState glyph={MessagesSquare} title="Nog geen berichten">
                  Stel hier je vragen aan het team van {BRAND}: over een bestelling, een maat of de voorraad.
                </EmptyState>
              ) :
              (
                <ol className="flex flex-col gap-6" aria-label={`Berichten in ${CHANNEL}`}>
                  {messages.map((m, i) => {
                    const prev = messages[i - 1]
                    const newDay = prev === undefined || prev.at.toDateString() !== m.at.toDateString()
                    return (
                      <li key={m.id} className="flex flex-col gap-4">
                        {newDay && (
                          <p className="text-center text-xs text-ink-3">
                            {m.at.toDateString() === DEMO_NOW.date.toDateString() ? "Vandaag" : dayLong(m.at)}
                          </p>
                        )}
                        <Message
                          avatar={<Avatar name={CHAT_PEOPLE[m.from].name} size={28} />}
                          name={CHAT_PEOPLE[m.from].name}
                          at={time(m.at)}
                        >
                          <p className="text-sm text-pretty whitespace-pre-line text-ink-2">{m.body}</p>
                        </Message>
                      </li>
                    )
                  })}
                </ol>
              )}
            <div ref={end} />
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                send(draft)
              }}
            >
              <div className="flex flex-wrap gap-2">
                {QUICK.map((q) => (
                  <Button
                    key={q}
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft(q)}
                    className="max-w-full"
                  >
                    <span className="truncate">{q}</span>
                  </Button>
                ))}
              </div>
              <Field label={`Bericht aan ${BRAND}`}>
                {(c) => (
                  <Textarea
                    {...c}
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(draft)
                    }}
                    placeholder={`Bericht aan ${BRAND} · @ om iemand te vermelden`}
                  />
                )}
              </Field>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                icon={<Send />}
                disabled={draft.trim() === ""}
                className="self-end"
              >
                Versturen
              </Button>
            </form>
          </div>
        )}
    </Page>
  )
}

/* ── afrekeningen ─────────────────────────────────────────────────────────────────────────────── */

/* What Northwind owes Allure per month, and what it paid: shipped lines at cost, less its corrections. */
export function StatementsPage() {
  const state = useDataState()
  const all = state === "empty" ? [] : allureStatements()
  const open = all.find((s) => s.status === "lopend")
  const paid = all.filter((s) => s.status === "betaald")
  return (
    <Page width="wide">
      <PageHead title="Afrekeningen" meta={`${BRAND} betaalt op de 15e voor de maand ervoor`} />
      {state === "loading" ?
        (
          <div aria-busy="true" className="flex flex-col gap-8">
            <FiguresSkeleton />
            <TableSkeleton rows={6} label="Afrekeningen laden" />
          </div>
        ) :
        state === "error" ?
        <LoadError what="Je afrekeningen" /> :
        all.length === 0 ?
        (
          <EmptyState glyph={Wallet} title="Nog geen afrekeningen">
            Zodra je een eerste bestelling voor {BRAND} verzendt, begint de afrekening van die maand hier te lopen.
          </EmptyState>
        ) :
        (
          <div className="flex flex-col gap-10">
            {open !== undefined && (
              <section aria-labelledby="lopend" className="flex flex-col gap-2 rounded-lg bg-well px-5 py-5 sm:px-6">
                <h2 id="lopend" className="text-sm text-ink-2">{open.label} · lopend</h2>
                <p className="figure text-4xl text-ink">{money(open.total)}</p>
                <p className="max-w-[62ch] text-sm text-pretty text-ink-2">
                  {plural(open.shippedUnits, "stuk", "stuks")} verzonden tot nu toe, {money(-open.corrected)}{" "}
                  aan correcties. {BRAND} betaalt op {dayLong(open.payDay)}.{" "}
                  <Link
                    to={paths.supplierPortal(`afrekeningen/${open.id}`)}
                    className="text-accent-ink underline-offset-2 hover:underline"
                  >
                    Bekijken
                  </Link>
                </p>
              </section>
            )}
            <PageSection
              id="maanden"
              title="Per maand"
              meta={`Betaald dit jaar: ${money(paid.reduce((n, s) => n + s.total, 0))}`}
            >
              <Table label="Afrekeningen per maand" minWidth={640}>
                <THead>
                  <Th>Maand</Th>
                  <Th align="right">Stuks</Th>
                  <Th align="right">Verzonden</Th>
                  <Th align="right">Correcties</Th>
                  <Th align="right">Totaal</Th>
                  <Th>Status</Th>
                </THead>
                <TBody>
                  {all.map((s) => (
                    <Tr key={s.id} onOpen={() => navigate(paths.supplierPortal(`afrekeningen/${s.id}`))}>
                      <Td header>
                        <Link
                          to={paths.supplierPortal(`afrekeningen/${s.id}`)}
                          className="font-medium hover:text-accent-ink"
                        >
                          {s.label}
                        </Link>
                      </Td>
                      <Td figure align="right">{count(s.shippedUnits)}</Td>
                      <Td figure align="right">{money(s.shipped)}</Td>
                      <Td figure align="right" muted>{money(s.corrected)}</Td>
                      <Td figure align="right" className="font-medium">{money(s.total)}</Td>
                      <Td>
                        <Status tone={STATEMENT_STATUS[s.status].tone}>
                          {s.status === "betaald" ? `Betaald ${day(s.payDay)}` : STATEMENT_STATUS[s.status].label}
                        </Status>
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </PageSection>
          </div>
        )}
    </Page>
  )
}

function invoice(s: Statement) {
  const lines = s.lines.map((l) =>
    `<tr><td>${l.title}</td><td>${l.quantity}</td><td>${money(l.unit)}</td><td>${money(l.total)}</td></tr>`
  ).join("")
  const corr = s.corrections.map((c) =>
    `<tr><td>#${c.order} ${c.title} · ${c.reason}</td><td>${c.quantity}</td><td>${money(c.unit)}</td><td>${
      money(c.total)
    }</td></tr>`
  ).join("")
  return `<!doctype html><meta charset="utf-8"><title>Factuur ${s.label}</title><style>body{font:14px system-ui;margin:40px}td,th{padding:4px 16px 4px 0;text-align:left}</style><h1>Factuur ${s.label}</h1><p>${ME.name} aan ${BRAND_LEGAL}</p><table><tr><th>Omschrijving</th><th>Aantal</th><th>Per stuk</th><th>Bedrag</th></tr>${lines}${corr}<tr><th>Totaal</th><th></th><th></th><th>${
    money(s.total)
  }</th></tr></table><p>${
    s.status === "betaald" ? `Betaald op ${dayFull(s.payDay)}.` : `Te betalen op ${dayFull(s.payDay)}.`
  }</p>`
}

/* One month: every product shipped at its cost, the corrections, and when it was (or will be) paid. */
export function StatementPage({ id }: { readonly id: string }) {
  const state = useDataState()
  const s = allureStatements().find((x) => x.id === id)
  if (state === "loading") {
    return (
      <Page width="record" label="Afrekening">
        <TableSkeleton rows={5} label="Afrekening laden" />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record" label="Afrekening">
        <LoadError what="Deze afrekening" />
      </Page>
    )
  }
  if (s === undefined || state === "empty") {
    return (
      <Page width="text" label="Afrekening niet gevonden">
        <EmptyState
          glyph={Wallet}
          title="Geen afrekening voor deze maand"
          action={<ButtonLink size="sm" to={paths.supplierPortal("afrekeningen")}>Naar afrekeningen</ButtonLink>}
        >
          Er is in deze maand niets voor {BRAND} verzonden, of de maand ligt vóór jullie samenwerking.
        </EmptyState>
      </Page>
    )
  }
  return (
    <Page width="record">
      <PageHead
        title={s.label}
        meta={<Status tone={STATEMENT_STATUS[s.status].tone}>{STATEMENT_STATUS[s.status].label}</Status>}
        actions={
          <Button
            size="sm"
            icon={<Download />}
            onClick={() => {
              saveFile(`allure-factuur-${s.id}.html`, invoice(s), "text/html")
              toast({ title: "Factuur gedownload", body: `allure-factuur-${s.id}.html` })
            }}
          >
            Factuur downloaden
          </Button>
        }
      />
      <div className="flex flex-col gap-10">
        <Figures
          label="Deze maand"
          items={[
            { label: "Verzonden", value: money(s.shipped), note: plural(s.shippedUnits, "stuk", "stuks") },
            { label: "Correcties", value: money(s.corrected), note: plural(s.corrections.length, "regel", "regels") },
            { label: "Totaal", value: money(s.total) },
            { label: s.status === "betaald" ? "Betaald op" : "Betaald op, verwacht", value: dayMonth(s.payDay) }
          ]}
        />
        <PageSection id="verzonden" title="Verzonden" meta="Tegen de afgesproken kostprijs">
          <Table label="Verzonden per product" minWidth={520}>
            <THead>
              <Th>Product</Th>
              <Th align="right">Stuks</Th>
              <Th align="right">Per stuk</Th>
              <Th align="right">Bedrag</Th>
            </THead>
            <TBody>
              {s.lines.map((l) => (
                <Tr key={l.productId}>
                  <Td header>
                    <Link to={paths.supplierPortal(`producten/${l.productId}`)} className="hover:text-accent-ink">
                      {l.title}
                    </Link>
                  </Td>
                  <Td figure align="right">{count(l.quantity)}</Td>
                  <Td figure align="right" muted>{money(l.unit)}</Td>
                  <Td figure align="right">{money(l.total)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </PageSection>
        <PageSection id="correcties" title="Correcties" meta="Retouren die bij de levering lagen">
          {s.corrections.length === 0 ?
            <p className="text-sm text-ink-3">Geen correcties deze maand.</p> :
            (
              <Table label="Correcties" minWidth={560}>
                <THead>
                  <Th>Bestelling</Th>
                  <Th>Dag</Th>
                  <Th>Artikel</Th>
                  <Th>Reden</Th>
                  <Th align="right">Bedrag</Th>
                </THead>
                <TBody>
                  {s.corrections.map((c) => (
                    <Tr key={`${c.order}-${c.title}`}>
                      <Td figure align="left">#{c.order}</Td>
                      <Td figure align="left" muted>{day(c.day)}</Td>
                      <Td header>{c.title}</Td>
                      <Td muted>{c.reason}</Td>
                      <Td figure align="right">{money(c.total)}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            )}
          <p className="text-xs text-pretty text-ink-3">
            Een retour om de maat telt niet als correctie: de maattabel is de pagina van {BRAND}.
          </p>
        </PageSection>
      </div>
    </Page>
  )
}

/* ── training ─────────────────────────────────────────────────────────────────────────────────── */

/* The courses Northwind opened to Allure: how it works with its suppliers, short and to the point. */
export function TrainingPage() {
  const state = useDataState()
  const { course } = useSupplier()
  const list = state === "empty" ? [] : COURSES
  return (
    <Page width="text">
      <PageHead title="Training" meta={`Wat ${BRAND} voor jullie heeft klaargezet`} />
      {state === "loading" ? <Rows n={3} /> : state === "error" ? <LoadError what="De training" /> : list.length === 0 ?
        (
          <EmptyState glyph={GraduationCap} title="Nog geen training">
            {BRAND} heeft nog geen cursus voor leveranciers opengezet. Je krijgt een melding zodra dat gebeurt.
          </EmptyState>
        ) :
        (
          <List label="Cursussen">
            {list.map((c) => {
              const progress = course[c.id]?.step ?? 0
              const done = progress >= c.blocks.length
              return (
                <ListRow
                  key={c.id}
                  href={paths.supplierPortal(`training/${c.id}`)}
                  lead={<GlyphTile>{done ? <CheckCircle size={16} /> : <GraduationCap size={16} />}</GlyphTile>}
                  title={c.title}
                  meta={`${c.minutes} min · ${
                    done ? "Afgerond" : progress > 0 ? `${progress} van ${c.blocks.length} gedaan` : "Nog niet begonnen"
                  } · ${c.by}, ${c.updated}`}
                />
              )
            })}
          </List>
        )}
    </Page>
  )
}

/* A course, one block at a time: read, answer the question, go on. Progress stays for this visit. */
export function CoursePage({ id }: { readonly id: string }) {
  const state = useDataState()
  const { course } = useSupplier()
  const c = COURSES.find((x) => x.id === id)
  if (state === "loading") {
    return (
      <Page width="text" label="Cursus">
        <Rows n={3} />
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="text" label="Cursus">
        <LoadError what="Deze cursus" />
      </Page>
    )
  }
  if (c === undefined) {
    return (
      <Page width="text" label="Cursus niet beschikbaar">
        <EmptyState
          glyph={Lock}
          title="Deze cursus staat niet voor jullie open"
          action={<ButtonLink size="sm" to={paths.supplierPortal("training")}>Naar training</ButtonLink>}
        >
          {BRAND} deelt alleen de cursussen die over het werk met leveranciers gaan.
        </EmptyState>
      </Page>
    )
  }
  const progress = course[c.id] ?? { step: 0, answers: {} }
  const step = Math.min(progress.step, c.blocks.length)
  const block = c.blocks[step]
  const set = (next: { step: number; answers: Readonly<Record<string, number>> }) =>
    setSupplier((s) => ({ ...s, course: { ...s.course, [c.id]: next } }))
  const answer = block?.kind === "vraag" ? progress.answers[block.id] : undefined

  return (
    <Page width="text">
      <PageHead title={c.title} meta={`${c.minutes} min · ${c.by}, bijgewerkt ${c.updated}`} />
      <div className="flex flex-col gap-8">
        <ProgressBar label="Voortgang" value={step} max={c.blocks.length} detail={`${step} van ${c.blocks.length}`} />
        {block === undefined ?
          (
            <EmptyState
              glyph={CheckCircle}
              title="Cursus afgerond"
              action={
                <>
                  <ButtonLink size="sm" to={paths.supplierPortal("training")}>Naar training</ButtonLink>
                  <Button size="sm" variant="ghost" onClick={() => set({ step: 0, answers: {} })}>Opnieuw doen</Button>
                </>
              }
            >
              {BRAND} ziet dat Allure Fulfillment deze cursus heeft gedaan.
            </EmptyState>
          ) :
          block.kind === "tekst" ?
          (
            <article className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-ink">{block.title}</h2>
              <p className="text-base text-pretty text-ink-2">{block.body}</p>
            </article>
          ) :
          (
            <article className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-ink">{block.question}</h2>
              <RadioGroup
                label={block.question}
                value={answer === undefined ? "" : String(answer)}
                onChange={(v) => set({ ...progress, answers: { ...progress.answers, [block.id]: Number(v) } })}
                options={block.options.map((o, i) => ({ value: String(i), label: o }))}
              />
              {answer !== undefined && (
                <p className={cx("text-sm", answer === block.right ? "text-good-ink" : "text-warn-ink")}>
                  {answer === block.right ? "Goed. " : "Niet helemaal. "}
                  {block.explain}
                </p>
              )}
            </article>
          )}
        {block !== undefined && (
          <div className="flex items-center justify-between gap-3">
            <Button
              size="sm"
              variant="ghost"
              disabled={step === 0}
              onClick={() => set({ ...progress, step: step - 1 })}
            >
              Vorige
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={block.kind === "vraag" && answer !== block.right}
              onClick={() => set({ ...progress, step: step + 1 })}
            >
              {step === c.blocks.length - 1 ? "Afronden" : "Volgende"}
            </Button>
          </div>
        )}
      </div>
    </Page>
  )
}

/* ── meldingen ────────────────────────────────────────────────────────────────────────────────── */

const NOTE_GLYPH = {
  order: ShoppingBag,
  chat: MessagesSquare,
  clock: Clock,
  check: ClipboardCheck,
  money: Wallet
} as const

/* What Northwind sent Allure's way: a new order, a message, a check, a payment. */
export function NotificationsPage() {
  const state = useDataState()
  const { read } = useSupplier()
  const notes = state === "empty" ? [] : supplierNotes()
  const unread = notes.filter((n) => n.unread && !read.has(n.id))
  return (
    <Page width="text">
      <PageHead
        title="Meldingen"
        meta={unread.length > 0 ? `${unread.length} ongelezen` : "Alles gelezen"}
        actions={unread.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              changeWithUndo(
                "Alles als gelezen gemarkeerd",
                (s) => ({ ...s, read: new Set([...s.read, ...unread.map((n) => n.id)]) })
              )}
          >
            Alles gelezen
          </Button>
        )}
      />
      {state === "loading" ? <Rows /> : state === "error" ?
        <LoadError what="Je meldingen" /> :
        (
          <NotificationList
            empty={
              <EmptyState glyph={Bell} title="Nog geen meldingen">
                Je hoort het hier als {BRAND} een bestelling stuurt, je iets vraagt of een afrekening betaalt.
              </EmptyState>
            }
            items={notes.map((n) => {
              const G = NOTE_GLYPH[n.glyph]
              return {
                id: n.id,
                mark: n.from === undefined
                  ? (
                    <GlyphTile>
                      <G size={16} />
                    </GlyphTile>
                  )
                  : <Avatar name={n.from} size={32} />,
                text: <Rich text={n.text} />,
                at: n.at,
                href: paths.supplierPortal(n.page),
                unread: n.unread && !read.has(n.id)
              }
            })}
          />
        )}
    </Page>
  )
}

/* ── instellingen ─────────────────────────────────────────────────────────────────────────────── */

export type SupplierSettingsTab = "profiel" | "meldingen" | "api-koppeling"

/* How Northwind knows Allure, what Allure hears about, and how its own systems connect. */
export function SettingsPage({ tab }: { readonly tab: SupplierSettingsTab }) {
  const state = useDataState()
  return (
    <Page width="text">
      <PageHead title="Instellingen" />
      <Tabs
        label="Instellingen"
        value={tab}
        onChange={(next) => navigate(paths.supplierPortal(`instellingen/${next}`))}
        tabs={[{ value: "profiel", label: "Bedrijfsprofiel" }, { value: "meldingen", label: "Meldingen" }, {
          value: "api-koppeling",
          label: "API-koppeling"
        }]}
      />
      {state === "loading" ?
        <Rows n={4} /> :
        state === "error" ?
        <LoadError what="Je instellingen" /> :
        tab === "profiel" ?
        <ProfileForm /> :
        tab === "meldingen" ?
        <NotifyForm /> :
        <ApiForm />}
    </Page>
  )
}

function ProfileForm() {
  const { profile } = useSupplier()
  const [draft, setDraft] = useState(profile)
  const [logo, setLogo] = useState<string | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)
  const valid = draft.name.trim() !== "" && draft.email.includes("@")
  return (
    <SettingsSection
      title="Bedrijfsprofiel"
      description={`Zo staat ${ME.name} bij ${BRAND} en in de mails aan je team.`}
      footer={
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || !valid}
          onClick={() => changeWithUndo("Bedrijfsprofiel opgeslagen", (s) => ({ ...s, profile: draft }))}
        >
          Opslaan
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={draft.name} size={48} />
          <div className="min-w-0 flex-1">
            <FileDrop
              accept="image/png,image/svg+xml"
              label={logo ?? "Logo kiezen"}
              hint="PNG of SVG, vierkant."
              onFiles={(fs) => {
                const f = fs[0]
                if (f !== undefined) {
                  setLogo(f.name)
                  toast({ title: "Logo klaargezet", body: `${f.name} wordt bewaard bij Opslaan.` })
                }
              }}
            />
          </div>
        </div>
        <Field label="Bedrijfsnaam">
          {(c) => <Input {...c} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
        </Field>
        <Field label="Wat je levert" hint={`${BRAND} ziet dit bij je profiel.`}>
          {(c) => (
            <Textarea
              {...c}
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="E-mailadres"
            {...(draft.email.includes("@") ? {} : { error: "Een geldig e-mailadres, bijvoorbeeld ops@allure.it." })}
          >
            {(c) => (
              <Input
                {...c}
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            )}
          </Field>
          <Field label="Telefoon">
            {(c) => (
              <Input
                {...c}
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            )}
          </Field>
        </div>
      </div>
    </SettingsSection>
  )
}

function NotifyForm() {
  const { notify, profile } = useSupplier()
  return (
    <SettingsSection
      title="Meldingen"
      description={`Per e-mail naar ${profile.email}. Wat hier aanstaat, krijg je ook in Meldingen.`}
    >
      <div className="flex flex-col">
        {NOTIFY_ROWS.map((r) => (
          <SettingRow
            key={r.key}
            title={r.label}
            description={r.detail}
            control={
              <Toggle
                label={r.label}
                on={notify[r.key] ?? false}
                onChange={(on) =>
                  changeWithUndo(
                    `${r.label} ${on ? "aan" : "uit"}`,
                    (s) => ({ ...s, notify: { ...s.notify, [r.key]: on } })
                  )}
              />
            }
          />
        ))}
      </div>
    </SettingsSection>
  )
}

function ApiForm() {
  const { api } = useSupplier()
  const [platform, setPlatform] = useState<Platform>(api.platform)
  const [url, setUrl] = useState(api.url)
  const [shown, setShown] = useState(false)
  const [test, setTest] = useState<"idle" | "busy" | "ok" | "fout">("idle")
  const own = platform === "eigen"
  const validUrl = /^https:\/\/[^\s]+\.[^\s]+/.test(url)
  const dirty = platform !== api.platform || url !== api.url
  const masked = `${api.key.slice(0, 13)}••••••••${api.key.slice(-4)}`
  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="API-koppeling"
        description={`Hoe bestellingen van ${BRAND} in je eigen systeem komen, en je voorraad terug.`}
        footer={
          <Button
            variant="primary"
            size="sm"
            disabled={!dirty || (own && !validUrl)}
            onClick={() => {
              changeWithUndo(
                "Koppeling opgeslagen",
                (s) => ({ ...s, api: { ...s.api, platform, url, enabled: platform !== "geen" } })
              )
              setTest("idle")
            }}
          >
            Opslaan
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          <RadioGroup<Platform>
            label="Platform"
            value={platform}
            onChange={setPlatform}
            options={PLATFORMS.map((p) => ({ value: p.id, label: p.label, description: p.detail }))}
          />
          {own && (
            <>
              <Field
                label="Webhook-URL"
                {...(validUrl
                  ? { hint: "Insyte stuurt elke nieuwe bestelling hierheen, als JSON." }
                  : { error: "Een https-adres, bijvoorbeeld https://allure.example/insyte/webhook." })}
              >
                {(c) => <Input {...c} value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />}
              </Field>
              <Field
                label="Geheime sleutel"
                hint="Zet hem in de header van elke aanroep naar Insyte. Deel hem met niemand."
              >
                {(c) => (
                  <span className="flex items-center gap-1">
                    <Input {...c} readOnly value={shown ? api.key : masked} className="min-w-0 flex-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={shown ? <EyeOff /> : <Eye />}
                      onClick={() => setShown(!shown)}
                    >
                      <span className="sr-only sm:not-sr-only">{shown ? "Verbergen" : "Tonen"}</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy />}
                      onClick={() => {
                        void navigator.clipboard?.writeText(api.key).catch(() => undefined)
                        toast({ title: "Sleutel gekopieerd" })
                      }}
                    >
                      <span className="sr-only sm:not-sr-only">Kopiëren</span>
                    </Button>
                  </span>
                )}
              </Field>
            </>
          )}
        </div>
      </SettingsSection>
      {platform !== "geen" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            loading={test === "busy"}
            onClick={() => {
              setTest("busy")
              window.setTimeout(() => setTest(own && !validUrl ? "fout" : "ok"), 900)
            }}
          >
            Verbinding testen
          </Button>
          {test === "ok" && (
            <span className="flex items-center gap-1.5 text-sm text-good-ink">
              <Check size={14} /> Verbinding werkt · <span className="figure">142 ms</span>
            </span>
          )}
          {test === "fout" && (
            <span className="text-sm text-bad-ink">Geen antwoord van dit adres. Controleer de URL.</span>
          )}
        </div>
      )}
    </div>
  )
}
