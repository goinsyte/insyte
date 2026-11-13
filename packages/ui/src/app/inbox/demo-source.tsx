import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import { EmptyPage } from "../common/empty-page"
import { useNow } from "../hooks/use-now"
import { ME } from "../lib/assignees"
import { CHANNEL_LABEL } from "../lib/channels"
import { MAILBOXES, mailboxStatus, PROVIDER_LABEL } from "../lib/mailboxes"
import type { EmailThread } from "../lib/types/domain"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { type ThreadState, useInbox } from "../stores/inbox-store"
import { useWorkspace } from "../stores/workspace-store"
import { AgentBanner } from "./agent-banner"
import { ChannelHeader, ChatLetter } from "./channel-parts"
import {
  type InboxDrafts,
  type InboxMailbox,
  type InboxSource,
  InboxSourceProvider,
  type InboxThread,
  type InboxWrites,
  type Letter
} from "./source"

/*
 * The inbox screen over the design app's stores, as it was before the seam (`source.tsx`): the seeded mail in its two
 * mailboxes and the chat channels' threads, the bodies and Insyte's drafts the screen used to write itself, and the
 * store's own changes with the design's toasts. The chat letter and the agent's band stay the design's.
 */

const Route = Object.assign(getRouteApi("/_admin/inbox/"), { fullPath: "/inbox/" } as const)

const SUGGESTED_REPLY = `Hoi Maya,

Bedankt voor je bericht. Ik heb je bestelling bekeken: die ligt vertraagd in ons magazijn, en daarom is de track & trace nog niet bijgewerkt.

Het team verwacht dat hij binnen 24–48 uur wordt verzonden. Omdat je hem vrijdag nodig hebt, heb ik hem met voorrang laten oppakken.

Excuses voor de vertraging. Zodra de track & trace verandert, laten we het je weten.

Met vriendelijke groet,
Carroline`

const MAYA_WARMER = `Hoi Maya,

Fijn dat je contact opneemt. Ik begrijp heel goed dat je dit vrijdag in huis wilt hebben, en het spijt me dat je moet wachten.

Ik heb je bestelling net bekeken: die ligt op dit moment nog in ons magazijn. Het team verwacht dat hij binnen 24–48 uur wordt verzonden, en ik heb hem zelf voorrang gegeven zodat hij zo snel mogelijk de deur uit gaat.

Zodra de track & trace is bijgewerkt, hoor je het meteen van me. Bedankt voor je geduld.

Hartelijke groet,
Carroline`

const MAYA_SHORTER =
  `Hoi Maya, je bestelling is vertraagd in het magazijn, maar wordt binnen 24–48 uur verzonden. Ik heb hem voorrang gegeven zodat hij er vrijdag is. Je krijgt de track & trace zodra die is bijgewerkt.

— Carroline`

function otherParticipant(t: EmailThread) {
  return (
    t.participants.find((p) => !p.email.endsWith("northwindclothing.co")) ??
      t.participants[0]
  )
}

/**
 * Insyte's drafts for a thread. The first thread has the full worked example; every other thread
 * gets a draft addressed to whoever wrote and about what they wrote, not someone else's order.
 */
function draftsFor(t: EmailThread | undefined): { reply: string; warmer: string; shorter: string } {
  if (!t || t.id === "th_1") return { reply: SUGGESTED_REPLY, warmer: MAYA_WARMER, shorter: MAYA_SHORTER }
  const name = otherParticipant(t)?.name.split(" ")[0] ?? "daar"
  const topic = t.subject.replace(/^(re|fwd?):\s*/i, "")
  return {
    reply:
      `Hoi ${name},\n\nBedankt voor je bericht over “${topic}”. Ik zoek het nu voor je uit en kom vandaag nog bij je terug met een antwoord.\n\nMet vriendelijke groet,\nElena`,
    warmer:
      `Hoi ${name},\n\nBedankt dat je contact opneemt, en voor je geduld. Ik heb je bericht over “${topic}” zelf opgepakt en zorg dat je vandaag nog van me hoort.\n\nHartelijke groet,\nElena`,
    shorter: `Hoi ${name}, bedankt voor je bericht over “${topic}”. Ik kom er vandaag bij je op terug.\n\n— Elena`
  }
}

function seedBody(t: EmailThread): string {
  if (t.id === "th_1") {
    return `Hallo Insyte-team,

Mijn bestelling van afgelopen dinsdag staat nog steeds op "wordt klaargemaakt voor verzending". De verwachte datum is al voorbij en ik heb dit vrijdag echt nodig voor een cadeau. Kunnen jullie de laatste track & trace voor me bekijken?

Alvast bedankt,
Maya`
  }
  if (t.messages[0]?.body_text) return t.messages[0].body_text
  return `${t.last_message_preview}\n\nBedankt,\n${otherParticipant(t)?.name.split(" ")[0]}`
}

function formatTimeOfDay(iso: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso))
}

/** The store's thread as the screen reads it. A reported thread leaves every folder, as the design had it. */
const threadOf = (t: ThreadState): InboxThread => {
  const other = otherParticipant(t) ?? { name: "", email: "" }
  return {
    id: t.id,
    subject: t.subject,
    mailbox: t.mailbox,
    other: { name: other.name, email: other.email },
    last_message_at: t.last_message_at,
    last_message_preview: t.last_message_preview,
    unread: t.unread,
    starred: t.starred,
    labels: t.labels,
    assignee: t.assignee,
    ticket_id: t.ticket_id,
    place: t.archived ? "archive" : t.spam ? "gone" : "inbox",
    hasAttachments: t.messages.some((m) => m.attachments.length > 0),
    hasInbound: t.messages.some((m) => m.direction === "inbound"),
    channel: t.channel === "email" ? undefined : t.channel,
    agent: t.agent
  }
}

const byId = (id: string) => useInbox.getState().threads.find((t) => t.id === id)

/** The letter as the screen used to write it: the first mail (the seed's body), then what was sent from here. */
function useDemoLetter(thread: InboxThread): Letter {
  const t = useInbox((s) => s.threads.find((x) => x.id === thread.id))
  return useMemo(() => {
    if (t === undefined) return { entries: [], ready: true }
    const other = otherParticipant(t) ?? { name: "", email: "" }
    return {
      ready: true,
      entries: [
        {
          id: `${t.id}:first`,
          direction: "inbound" as const,
          kind: "message" as const,
          from: { name: other.name, email: other.email },
          at: t.last_message_at,
          body: t.body ?? seedBody(t)
        },
        ...(t.sent ?? []).map((m) => ({
          id: m.id,
          direction: "outbound" as const,
          kind: m.kind,
          from: { name: "Elena Hart", email: "elena@northwindclothing.co" },
          to: m.to,
          at: m.at,
          body: m.body
        }))
      ]
    }
  }, [t])
}

/** A chat thread's letter (PLAN 27): its bubbles, the agent's band, and a reply that waits out the window. */
function DemoChatLetter({ thread }: { thread: InboxThread }) {
  const t = useInbox((s) => s.threads.find((x) => x.id === thread.id))
  const update = useInbox((s) => s.update)
  const members = useWorkspace((s) => s.members)
  const now = useNow(60_000)
  if (t === undefined) return null
  /** A chat reply: a bubble that waits out the window before it leaves, so Undo means it never went. */
  const sendChat = (text: string, template?: string) => {
    const at = new Date().toISOString()
    const msg = {
      id: `m_${Date.now()}`,
      from: "team" as const,
      name: members.find((m) => m.id === ME)?.name ?? "Elena Hart",
      at,
      text,
      read: false,
      template
    }
    const before = t
    update(t.id, {
      chat: [...(t.chat ?? []), msg],
      last_message_at: at,
      last_message_preview: text.slice(0, 80)
    })
    undoable(
      "Wordt verstuurd…",
      () =>
        update(before.id, {
          chat: before.chat,
          last_message_at: before.last_message_at,
          last_message_preview: before.last_message_preview
        }),
      `Via ${CHANNEL_LABEL[t.channel ?? "email"]} aan ${otherParticipant(t)?.name}.`
    )
  }
  return (
    <ChatLetter
      thread={t}
      now={now}
      banner={<AgentBanner thread={t} />}
      composerDisabled={t.agent?.state === "active"
        ? "Insyte voert dit gesprek. Neem het over om zelf te antwoorden."
        : undefined}
      onSend={(text, tpl) => sendChat(text, tpl?.name)}
    />
  )
}

/** The first day's letter side: connect a mailbox, or write the first mail; the other channels after. */
function DemoEmpty({ onCompose }: { onCompose: () => void }) {
  const navigate = useNavigate()
  return (
    <EmptyPage
      kind="inbox"
      count="0 berichten"
      title="Nog niets binnen"
      body="Koppel je support-mailbox, Gmail of Outlook, en je berichten komen hier binnen."
      action={{ label: "Mailbox koppelen", onClick: () => void navigate({ to: "/settings/integrations" }) }}
      secondary={{ label: "Nieuwe e-mail", onClick: onCompose }}
      startsTitle="Daarna je andere kanalen"
      starts={[
        {
          id: "whatsapp",
          label: "WhatsApp Business",
          body: "Klanten appen je nummer, jij antwoordt hier.",
          to: "/settings/integrations"
        },
        {
          id: "instagram",
          label: "Instagram",
          body: "Berichten en reacties op je stories.",
          to: "/settings/integrations"
        },
        {
          id: "webchat",
          label: "Websitechat",
          body: "Een chat op je Shopify-winkel.",
          to: "/settings/integrations"
        }
      ]}
    />
  )
}

const CHANNELS: NonNullable<InboxSource["channels"]> = { Header: ChannelHeader, Letter: DemoChatLetter }

/** The design's drafts, written on the screen: the same three texts for a thread, at once. */
const drafts: InboxDrafts = {
  useDraft: (t) => {
    if (t === null) return undefined
    const texts = draftsFor(byId(t.id))
    return {
      reply: texts.reply,
      rewrite: (style) => Promise.resolve(texts[style]),
      use: () => {}
    }
  }
}

/** The inbox screen over the design app's stores. */
export function DemoInboxSource({ children }: { children: ReactNode }) {
  const navigate = useNavigate({ from: Route.fullPath })
  const search = Route.useSearch()
  const state = useInbox((s) => s.threads)
  const update = useInbox((s) => s.update)
  const addThread = useInbox((s) => s.add)
  const removeThread = useInbox((s) => s.remove)
  const integrations = useWorkspace((s) => s.integrations)
  const members = useWorkspace((s) => s.members)
  const createTicket = useWorkspace((s) => s.createTicket)
  const gate = useGate("support", 2)
  const threads = useMemo(() => state.map(threadOf), [state])
  const mailboxes = useMemo<ReadonlyArray<InboxMailbox>>(
    () =>
      MAILBOXES.map((m) => ({
        id: m.id,
        address: m.address,
        label: m.label,
        logo: { brand: m.provider, name: PROVIDER_LABEL[m.provider] },
        status: mailboxStatus(m, integrations),
        providerLabel: PROVIDER_LABEL[m.provider],
        reconnectLabel: `${PROVIDER_LABEL[m.provider]} opnieuw koppelen`
      })),
    [integrations]
  )
  const people = useMemo(
    () => members.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.name, role: m.role })),
    [members]
  )

  const writes: InboxWrites = {
    markRead: (t, read) => update(t.id, { unread: !read }),
    star: (t, starred) => update(t.id, { starred }),
    assign: (t, memberId, said) => {
      const before = t.assignee
      update(t.id, { assignee: memberId })
      undoable(said.label, () => update(t.id, { assignee: before }))
    },
    // "1 uur uitstellen" archives here, as the design had it.
    setAside: (t, as, said) => {
      update(t.id, as === "spam" ? { spam: true } : { archived: true })
      undoable(said.label, () => update(t.id, { archived: false, spam: false }))
    },
    linkTicket: (t) => {
      const ticket = createTicket({
        title: t.subject,
        description: `Van ${t.other.name} (${t.other.email}): ${t.last_message_preview}`,
        priority: "medium"
      })
      update(t.id, { ticket_id: ticket.id })
      toast.success(`Ticket ${ticket.number} aangemaakt vanuit deze mail`, {
        action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: ticket.id } as never }) }
      })
    },
    reply: (t, body, said) => {
      const before = byId(t.id)
      if (before === undefined) return false
      const at = new Date().toISOString()
      update(t.id, {
        last_message_preview: body.slice(0, 80),
        last_message_at: at,
        sent: [...(before.sent ?? []), { id: `sent_${Date.now()}`, kind: "reply", at, body }]
      })
      undoable(said.label, () =>
        update(before.id, {
          sent: before.sent,
          last_message_preview: before.last_message_preview,
          last_message_at: before.last_message_at
        }))
      return true
    },
    forward: (t, to, note, said) => {
      const before = byId(t.id)
      if (before === undefined) return false
      update(t.id, {
        sent: [...(before.sent ?? []), {
          id: `fwd_${Date.now()}`,
          kind: "forward",
          at: new Date().toISOString(),
          body: note,
          to
        }]
      })
      undoable(said.label, () => update(before.id, { sent: before.sent }))
      return true
    },
    compose: ({ to, subject, body, mailbox }, said) => {
      const at = new Date().toISOString()
      const id = `thread_new_${Date.now()}`
      const thread: ThreadState = {
        id,
        subject,
        participants: [
          { name: "Elena Hart", email: "elena@northwindclothing.co" },
          { name: to.split("@")[0] ?? to, email: to }
        ],
        last_message_at: at,
        last_message_preview: body.slice(0, 80),
        unread: false,
        starred: false,
        labels: [],
        messages: [],
        mailbox: mailbox ?? "support",
        assignee: ME,
        body: "",
        sent: [{ id: `sent_${Date.now()}`, kind: "reply", at, body }]
      }
      addThread(thread)
      undoable(said.label, () => removeThread(id))
      return id
    }
  }

  const source: InboxSource = {
    threads,
    mailboxes,
    search,
    go: (next) => void navigate({ search: next }),
    me: ME,
    people,
    useLetter: useDemoLetter,
    writes,
    gate,
    time: formatTimeOfDay,
    connect: { to: "/settings/integrations" },
    Empty: DemoEmpty,
    drafts,
    channels: CHANNELS
  }
  return <InboxSourceProvider value={source}>{children}</InboxSourceProvider>
}
