import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { AlertTriangle, Check, Clock, Lock, MessageCircle, Send, Sparkle, Sparkles, UserPlus } from "../../icons"
import { InsyteMark } from "../ask/parts"
import {
  CHANNEL_LABEL,
  type ChannelId,
  type ChatMessage,
  fillTemplate,
  lastInbound,
  mayReply,
  replyWindow,
  type WhatsAppTemplate
} from "../lib/channels"
import { cn } from "../lib/utils"
import { ChannelMark } from "./channel-mark"

/*
 * The chat channels' parts as they are drawn (PLAN 27–28, design §4–5), with no store behind them: the band over a
 * channel's threads, the letter as bubbles with the reply window, the connect steps' words, the widget's preview, and
 * the customer agent's handover band. The design app's `channel-parts.tsx` and `agent-banner.tsx` wrap them over its
 * stores; the console gives them the server's (M15 step 8). They load with no data source installed.
 */

/** The band itself, for a host that knows the channel's state on its own (the console, M15 step 8). */
export function ChannelHeaderView(
  { channel, count, live, account }: {
    channel: Exclude<ChannelId, "email">
    count: number
    live: boolean
    account: string
  }
) {
  const st = { live, account }
  return (
    <div className="sticky top-0 z-[1] flex h-9 items-center gap-2 bg-glacier px-5 text-sm">
      <ChannelMark channel={channel} size={16} />
      <span className="min-w-0 truncate font-medium text-ink-2">{CHANNEL_LABEL[channel]}</span>
      <span className="min-w-0 truncate text-ink-3">{st.account}</span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-ink-3 tabular-nums">
        {st.live ?
          (
            <>
              <span className="size-1.5 rounded-full bg-signal-green" aria-hidden />
              {count}
            </>
          ) :
          (
            <Link to="/settings/integrations" className="font-medium text-signal-amber hover:underline">
              Opnieuw koppelen
            </Link>
          )}
      </span>
    </div>
  )
}

const time = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))

/**
 * The window a business has on WhatsApp and Instagram: amber in its last hours, and once closed the
 * sentence that says what may still be sent.
 */
export function ReplyWindowNotice(
  { channel, messages, now }: { channel: ChannelId; messages: ReadonlyArray<ChatMessage>; now: number }
) {
  const w = replyWindow(channel, lastInbound(messages), now)
  if (!w.applies) return null
  const can = mayReply(channel, w)
  if (w.open) {
    return (
      <p
        className={cn(
          "flex items-center gap-2 px-4 py-2 text-sm",
          w.hoursLeft < 6 ? "bg-signal-amber-bg text-ink" : "bg-mist text-ink-2"
        )}
      >
        <Clock
          className={cn("size-3.5 shrink-0", w.hoursLeft < 6 ? "text-signal-amber" : "text-ink-3")}
          strokeWidth={1.75}
        />
        Nog {w.hoursLeft === 0 ? "minder dan een uur" : `${w.hoursLeft} ${w.hoursLeft === 1 ? "uur" : "uur"}`}{" "}
        om vrij te antwoorden; daarna {channel === "whatsapp"
          ? "alleen een goedgekeurd sjabloon"
          : "kun je pas weer antwoorden als de klant iets stuurt"}.
      </p>
    )
  }
  return (
    <p className="flex items-center gap-2 bg-signal-amber-bg px-4 py-2 text-ink text-sm">
      <Lock className="size-3.5 shrink-0 text-signal-amber" strokeWidth={1.75} />
      {can === "template"
        ? "Het venster van 24 uur is dicht. Je kunt alleen een goedgekeurd WhatsApp-sjabloon sturen."
        : "Het venster van 24 uur is dicht. Instagram laat je pas weer antwoorden als de klant iets stuurt."}
    </p>
  )
}

/** One bubble. The customer on the left on `mist`; the team and Insyte on the right, Insyte marked. */
function Bubble({ m, customer, at }: { m: ChatMessage; customer: string; at: (iso: string) => string }) {
  const ours = m.from !== "customer"
  return (
    <li className={cn("flex max-w-[78%] flex-col gap-1", ours ? "items-end self-end" : "items-start self-start")}>
      <span className="flex items-center gap-1.5 text-ink-3 text-xs">
        {m.from === "insyte" ? <InsyteMark size={14} /> : null}
        {m.from === "insyte" ? "Insyte · automatisch" : m.from === "team" ? (m.name ?? "Team") : customer}
        <span className="tabular-nums">{at(m.at)}</span>
      </span>
      <p
        className={cn(
          "whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-base leading-[1.5]",
          ours ? (m.from === "insyte" ? "bg-arc-tint text-ink" : "bg-ink/7 text-ink") : "bg-mist text-ink"
        )}
      >
        {m.template ? <span className="mb-1 block text-ink-3 text-xs">Sjabloon · {m.template}</span> : null}
        {m.text}
      </p>
      {ours && m.read !== undefined ?
        (
          <span className="flex items-center gap-1 text-ink-3 text-xs">
            <Check className="size-3" strokeWidth={2.25} />
            {m.read ? "Gelezen" : "Afgeleverd"}
          </span>
        ) :
        null}
    </li>
  )
}

/** The customer agent's answer, waiting for a person (Eerst vragen, Alleen concepten): Versturen, Aanpassen, Weggooien. */
export interface ChatDraftView {
  text: string
  /** "Versturen": the draft goes as the team's reply, with its Undo. */
  onSend: () => void
  /** "Aanpassen": its words go into the composer below. */
  onUse: () => void
  /** "Weggooien", with its Undo. */
  onDiscard: () => void
}

/**
 * Insyte's draft in a chat, as the mail letter's "Insyte stelde een antwoord op": on the dark ground, on the team's
 * side, with its three ways on. `blocked` (the composer's reason) keeps them shut.
 */
function ChatDraftCard(
  { draft, blocked, onUse }: { draft: ChatDraftView; blocked: string | undefined; onUse: () => void }
) {
  return (
    <section aria-label="Concept van Insyte" className="mt-3 flex max-w-[78%] flex-col gap-2 self-end">
      <div className="flex flex-col gap-3 rounded-xl bg-abyss px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-mesh-ink" strokeWidth={1.75} />
          <span className="font-medium text-mesh-ink text-sm leading-none">Insyte stelde een antwoord op</span>
        </div>
        <p className="whitespace-pre-wrap text-base text-mesh-ink-2 leading-[1.65]">{draft.text}</p>
      </div>
      <div className="flex items-center justify-end gap-2" title={blocked}>
        <button
          type="button"
          disabled={!!blocked}
          onClick={onUse}
          className="flex h-8 items-center rounded-md px-3 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aanpassen
        </button>
        <button
          type="button"
          disabled={!!blocked}
          onClick={draft.onDiscard}
          className="flex h-8 items-center rounded-md px-3 text-base text-ink-2 leading-none transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          Weggooien
        </button>
        <button
          type="button"
          disabled={!!blocked}
          onClick={draft.onSend}
          className="flex h-8 items-center gap-2 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink leading-none shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="size-3.5" strokeWidth={2} />
          Versturen
        </button>
      </div>
    </section>
  )
}

/**
 * The chat letter itself, for a host that reads the conversation on its own (the console's website chat, M15 step 8):
 * who and where, the bubbles, and the composer.
 */
export function ChatLetterView({
  channel,
  customer,
  handle,
  orderRef,
  messages,
  live,
  templates = [],
  now,
  onSend,
  banner,
  composerDisabled,
  reconnect = "/settings/integrations",
  clock = time,
  draft
}: {
  channel: Exclude<ChannelId, "email">
  customer: string
  handle?: string | undefined
  orderRef?: string | undefined
  messages: ReadonlyArray<ChatMessage>
  live: boolean
  /** WhatsApp's approved templates, for past its window. */
  templates?: ReadonlyArray<WhatsAppTemplate>
  now: number
  onSend: (text: string, template?: WhatsAppTemplate) => void
  banner?: React.ReactNode
  composerDisabled?: string | undefined
  /** Where "Opnieuw koppelen" leads. */
  reconnect?: string
  /** A time of day as the bubbles print it; the host's zone, so its server and the browser agree. */
  clock?: (iso: string) => string
  /** The customer agent's draft, after the last bubble; absent when there is none. */
  draft?: ChatDraftView | undefined
}) {
  const st = { live }
  const thread = { handle, orderRef }
  const w = replyWindow(channel, lastInbound(messages), now)
  const can = mayReply(channel, w)
  const [text, setText] = useState("")
  const [tpl, setTpl] = useState<WhatsAppTemplate | null>(null)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [messages.length, draft?.text])
  const blocked = composerDisabled ??
    (!st.live
      ? `${CHANNEL_LABEL[channel]} is ontkoppeld. Koppel het opnieuw om te antwoorden.`
      : can === "none"
      ? "Wacht tot de klant weer iets stuurt."
      : undefined)
  const approved = templates.filter((t) => t.status === "approved")
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-wrap items-center gap-2 pt-1 pb-4">
          <ChannelMark channel={channel} size={20} />
          <h1 className="font-medium text-ink text-xl leading-tight">{customer}</h1>
          <span className="text-ink-3 text-sm">{thread.handle}</span>
          {thread.orderRef
            ? (
              <span className="rounded-sm bg-arc-tint px-1.5 py-px font-medium text-arc-ink text-xs">
                {thread.orderRef}
              </span>
            )
            : null}
        </div>
        {banner}
        <ol className="flex flex-col gap-3 pt-2">
          {messages.map((m) => <Bubble key={m.id} m={m} customer={customer} at={clock} />)}
        </ol>
        {draft ?
          (
            <div className="flex flex-col">
              <ChatDraftCard
                draft={draft}
                blocked={blocked}
                onUse={() => {
                  setText(draft.text)
                  draft.onUse()
                }}
              />
            </div>
          ) :
          null}
        <div ref={end} />
      </div>
      <ReplyWindowNotice channel={channel} messages={messages} now={now} />
      {!st.live ?
        (
          <div className="flex shrink-0 items-center gap-2 bg-signal-amber-bg px-4 py-2 text-ink text-sm">
            <AlertTriangle className="size-3.5 shrink-0 text-signal-amber" strokeWidth={2} />
            <span className="min-w-0 flex-1">
              {CHANNEL_LABEL[channel]}{" "}
              vraagt opnieuw toestemming. Er komt niets binnen en er gaat niets uit tot het weer gekoppeld is.
            </span>
            <Link to={reconnect} className="shrink-0 font-medium hover:underline">
              Opnieuw koppelen
            </Link>
          </div>
        ) :
        null}
      <div className="flex shrink-0 flex-col gap-2 bg-mist px-4 py-3">
        {can === "template" && !blocked ?
          (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-3 text-sm">Sjabloon</span>
              {approved.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tpl?.id === t.id}
                  onClick={() => setTpl(t)}
                  className={cn(
                    "h-7 rounded-md px-2 text-sm transition-colors",
                    tpl?.id === t.id ? "bg-abyss font-medium text-mesh-ink" : "bg-paper text-ink-2 hover:text-ink"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) :
          null}
        <div className="flex items-end gap-2">
          <textarea
            value={can === "template" && tpl
              ? fillTemplate(tpl.body, { naam: customer.split(" ")[0] ?? customer, order: thread.orderRef })
              : text}
            readOnly={can === "template"}
            disabled={!!blocked}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim() && can === "free") {
                onSend(text.trim())
                setText("")
              }
            }}
            rows={2}
            placeholder={blocked ??
              (can === "template" ? "Kies een sjabloon" : `Antwoord via ${CHANNEL_LABEL[channel]}`)}
            aria-label="Antwoord"
            className="field min-h-[44px] flex-1 resize-none rounded-md px-3 py-2.5 text-base text-ink leading-[1.4] outline-none placeholder:text-ink-3 focus:bg-paper disabled:opacity-60"
          />
          <button
            type="button"
            disabled={!!blocked || (can === "free" ? !text.trim() : !tpl)}
            onClick={() => {
              if (can === "template" && tpl) {
                onSend(
                  fillTemplate(tpl.body, { naam: customer.split(" ")[0] ?? customer, order: thread.orderRef }),
                  tpl
                )
                setTpl(null)
              } else {
                onSend(text.trim())
                setText("")
              }
            }}
            className="flex h-11 items-center gap-2 rounded-md bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-3.5" strokeWidth={2} />
            Versturen
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── connecting a channel ──────────────────────────────────────────────────────────────────── */

export const STEPS: Record<Exclude<ChannelId, "email">, ReadonlyArray<{ title: string; body: string }>> = {
  whatsapp: [
    {
      title: "Meta-bedrijfsaccount",
      body:
        "Je logt in bij Meta en kiest het bedrijfsaccount van Northwind. Insyte krijgt alleen toegang tot berichten."
    },
    {
      title: "Telefoonnummer",
      body: "Het nummer waarop klanten je appen. Het mag niet al in de gewone WhatsApp-app staan."
    },
    {
      title: "Weergavenaam en sjabloon",
      body:
        "De naam die klanten zien, en een eerste sjabloon dat Meta goedkeurt, zodat je ook na 24 uur kunt antwoorden."
    }
  ],
  instagram: [
    {
      title: "Instagram-bedrijfsaccount",
      body: "Je logt in bij Meta en kiest het Instagram-account dat aan je Facebook-pagina hangt."
    },
    {
      title: "Berichten toestaan",
      body: "Instagram vraagt of apps je berichten mogen lezen en beantwoorden. Reacties en stories blijven van jou."
    }
  ],
  webchat: [
    {
      title: "App-embed in je thema",
      body:
        "Insyte zet de chat als app-embed in het thema van de winkel. Je kunt hem daar met één schakelaar weer uitzetten."
    },
    {
      title: "Kleur en welkomsttekst",
      body: "De chat neemt de kleur van je winkel over en begroet bezoekers met de tekst die je hier kiest."
    }
  ]
}

/** A static drawing of the shopper's side of the website chat, with the store's greeting. */
export function WidgetPreview(
  { greeting, agent = false, store = "Northwind EU" }: { greeting: string; agent?: boolean; store?: string }
) {
  return (
    <div aria-hidden className="flex flex-col gap-2 rounded-lg bg-mist p-3">
      <div className="flex items-center gap-2 rounded-md bg-abyss px-3 py-2 text-mesh-ink text-sm">
        <MessageCircle className="size-3.5" strokeWidth={1.75} />
        {store}
        {agent
          ? (
            <span className="ml-auto flex items-center gap-1 text-mesh-ink-2 text-xs">
              <Sparkle className="size-3" strokeWidth={1.75} />antwoordt meteen
            </span>
          )
          : null}
      </div>
      <p className="max-w-[80%] rounded-lg bg-paper px-3 py-2 text-ink text-sm">{greeting}</p>
      <div className="rounded-md bg-paper px-3 py-2 text-ink-3 text-sm">Typ een bericht</div>
    </div>
  )
}

/** A conversation the agent handled: one quiet line. */
export function AgentHandled({ summary }: { summary?: string | undefined }) {
  return (
    <p className="mb-2 flex items-start gap-2 rounded-lg bg-mist px-3 py-2 text-ink-2 text-sm">
      <InsyteMark size={18} />
      <span>
        <span className="font-medium text-ink">Door Insyte afgehandeld.</span> {summary}
      </span>
    </p>
  )
}

/**
 * The handover band at the head of the letter: why, the summary, and Overnemen or Teruggeven aan Insyte. Its own, for a
 * host that keeps the handover itself (the console's website chat, M15 step 8).
 */
export function AgentBand({
  state,
  reason,
  summary,
  taken,
  me,
  onTakeOver,
  onGiveBack
}: {
  state: "handed_over" | "active"
  reason?: string | undefined
  summary?: string | undefined
  /** The viewer took it over. */
  taken: boolean
  /** The viewer's name, for "Jij hebt het overgenomen, …". */
  me: string
  onTakeOver: () => void
  onGiveBack: () => void
}) {
  const a = { state, reason, summary }
  const takeOver = onTakeOver
  const giveBack = onGiveBack
  return (
    <section aria-label="Overdracht" className="flex flex-col gap-2 rounded-lg bg-arc-tint px-4 py-3">
      <p className="flex items-start gap-2 text-ink text-sm">
        <InsyteMark size={18} />
        <span>
          {a.state === "active" ? <span className="font-medium">Insyte voert dit gesprek weer.</span> : (
            <>
              <span className="font-medium">Insyte heeft dit overgedragen:</span> {a.reason}
            </>
          )}
        </span>
      </p>
      {a.summary ? <p className="pl-[26px] text-ink-2 text-sm leading-relaxed">{a.summary}</p> : null}
      <div className="flex flex-wrap gap-2 pl-[26px]">
        {a.state === "active" || !taken ?
          (
            <button
              type="button"
              onClick={takeOver}
              className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
            >
              <UserPlus className="size-3.5" strokeWidth={1.75} />
              Overnemen
            </button>
          ) :
          (
            <span className="flex h-8 items-center text-ink-2 text-sm">
              Jij hebt het overgenomen, {me.split(" ")[0]}.
            </span>
          )}
        {a.state !== "active" ?
          (
            <button
              type="button"
              onClick={giveBack}
              className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-ink text-sm hover:bg-paper/80"
            >
              <Sparkle className="size-3.5" strokeWidth={1.75} />
              Teruggeven aan Insyte
            </button>
          ) :
          null}
      </div>
    </section>
  )
}
