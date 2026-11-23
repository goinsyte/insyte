import { useId, useState } from "react"
import { AGENTS } from "../../fixtures/agents.ts"
import { STORE_CHATS } from "../../fixtures/inbox.ts"
import type { StoreChat, StoreLine } from "../../fixtures/inbox.ts"
import { customer } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { AgentAvatar, Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Bot, CheckCircle, ChevronLeft, MessageSquare, Send, Ticket as TicketGlyph } from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"

import { SEND_WINDOW_S } from "../../ui/proposal.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { Heading, MY_KEY, Panes } from "./parts.tsx"
import { addStoreLine, createTicket, dropStoreLine, nowClock, setStoreChatClosed, useInboxState } from "./store.ts"

const AGENT = AGENTS.find((a) => a.id === "waar-is-mijn-bestelling")

/**
 * Winkelchat: the chat on the shop, live. The agent answers what it can from the knowledge base and
 * hands a visitor over when it cannot (a code it may not change, a size question, a supplier's
 * delivery time); those are the open ones, and Live's count. A person answers here with the page the
 * visitor is on and their cart beside it, closes the chat, or turns it into a ticket for later.
 */
export function StoreChatScreen() {
  const view = useView()
  const state = dataState(view)
  const access = useAccess("support")
  const s = useInboxState()
  const id = useQuery("chat")
  const isClosed = (c: StoreChat) => c.state === "afgehandeld" || s.closedStoreChats.includes(c.id)
  const open = STORE_CHATS.filter((c) => !isClosed(c))
  const done = STORE_CHATS.filter(isClosed)
  const active = STORE_CHATS.find((c) => c.id === id)

  if (!access.view) {
    return (
      <div className="pane-scroll flex-1">
        <h1 className="sr-only">Winkelchat</h1>
        <Denied area="support" what="de winkelchat" />
      </div>
    )
  }

  const row = (c: StoreChat) => {
    const lines = [...c.lines, ...(s.storeLines[c.id] ?? [])]
    const last = lines.at(-1)
    const current = c.id === id
    return (
      <li key={c.id}>
        <Link
          to={`${paths.storeChat}?chat=${c.id}`}
          aria-current={current ? "page" : undefined}
          className={cx(
            "flex flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors",
            current ? "bg-selected" : "hover:bg-hover"
          )}
        >
          <span className="flex items-baseline gap-2">
            <span className={cx("min-w-0 flex-1 truncate text-sm text-ink", !isClosed(c) && "font-semibold")}>
              {c.about}
            </span>
            <span className="figure shrink-0 text-xs text-ink-3">{last?.at ?? c.startedAt}</span>
          </span>
          <span className="truncate text-xs text-ink-3">
            {c.visitor} · {c.place}
          </span>
          {last !== undefined && <span className="truncate text-sm text-ink-2">{last.text}</span>}
        </Link>
      </li>
    )
  }

  const list = (
    <section aria-labelledby="winkelchat-lijst" className="pane-scroll flex min-h-0 flex-1 flex-col gap-5 px-2 py-3">
      <div className="flex items-baseline justify-between gap-2 px-2">
        {active === undefined
          ? <h1 id="winkelchat-lijst" className="text-md font-semibold text-ink">Winkelchat</h1>
          : <h2 id="winkelchat-lijst" className="text-md font-semibold text-ink">Winkelchat</h2>}
        {state === "ready" && (
          <span className="text-xs text-ink-3">
            <span className="figure">{open.length}</span> open
          </span>
        )}
      </div>
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Chats laden" className="flex flex-col gap-3 px-3">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        )
        : state === "error" || state === "empty"
        ? null
        : (
          <>
            <section aria-label="Open" className="flex flex-col gap-1">
              <Heading>
                <span className="px-3">Wacht op jou</span>
              </Heading>
              {open.length === 0
                ? <p className="px-3 text-sm text-ink-3">De agent heeft alles zelf beantwoord.</p>
                : <ul className="flex flex-col gap-px">{open.map(row)}</ul>}
            </section>
            <section aria-label="Afgehandeld vandaag" className="flex flex-col gap-1">
              <Heading>
                <span className="px-3">Afgehandeld vandaag</span>
              </Heading>
              <ul className="flex flex-col gap-px">{done.map(row)}</ul>
            </section>
          </>
        )}
    </section>
  )

  const detail = state === "error"
    ? (
      <ErrorState
        title="De winkelchat kwam niet binnen"
        detail="WS /storefront-chat · 1006"
        action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
      >
        Bezoekers zien zolang het contactformulier in plaats van de chat.
      </ErrorState>
    )
    : state === "loading"
    ? (
      <div aria-busy="true" className="flex flex-col gap-3 px-8 pt-8">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-16 w-3/4" />
        <Skeleton className="ml-auto h-12 w-2/3" />
      </div>
    )
    : state === "empty"
    ? (
      <EmptyState
        glyph={MessageSquare}
        title="De winkelchat staat nog uit"
        action={
          <Button variant="primary" onClick={() => navigate(paths.settings("koppelingen"))}>
            Chat op de winkel zetten
          </Button>
        }
      >
        Zet de chat op je Shopify-winkel. De agent beantwoordt vragen uit de kennisbank en haalt jou erbij als het niet
        lukt.
      </EmptyState>
    )
    : active === undefined
    ? (
      <div className="pane-scroll flex-1">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-8 py-10">
          <h2 className="text-xl font-semibold text-ink">
            <span className="figure">{open.length}</span> {open.length === 1 ? "bezoeker wacht" : "bezoekers wachten"}
            {" "}
            op een collega
          </h2>
          <p className="text-sm text-pretty text-ink-2">
            De agent beantwoordde vandaag <span className="figure">{done.length}</span>{" "}
            chats zelf. Kies links een gesprek; de bezoeker ziet dat je typt.
          </p>
        </div>
      </div>
    )
    : (
      <ChatView
        key={active.id}
        c={active}
        lines={[...active.lines, ...(s.storeLines[active.id] ?? [])]}
        closed={isClosed(active)}
        edit={access.edit}
      />
    )

  return <Panes list={list} detail={detail} show={active === undefined ? "list" : "detail"} listWidth="20rem" />
}

function LineView({ line, visitor }: { readonly line: StoreLine; readonly visitor: string }) {
  const ours = line.from !== "visitor"
  const name = line.from === "visitor"
    ? visitor
    : line.from === "agent"
    ? (AGENT?.name ?? "Agent")
    : PEOPLE[line.who ?? MY_KEY].name
  return (
    <li className={cx("flex gap-2.5", ours && "flex-row-reverse")}>
      <span className="pt-0.5">
        {line.from === "agent"
          ? <AgentAvatar glyph={AGENT?.glyph ?? Bot} size={24} />
          : <Avatar name={name} size={24} />}
      </span>
      <div className={cx("flex max-w-[34rem] min-w-0 flex-col gap-1", ours && "items-end")}>
        <p className="flex items-baseline gap-2 text-xs text-ink-3">
          <span className="font-medium text-ink-2">{name}</span>
          <span className="figure">{line.at}</span>
        </p>
        <p
          className={cx(
            "rounded-lg px-3 py-2 text-sm leading-6 text-pretty",
            line.from === "visitor"
              ? "bg-well text-ink"
              : line.from === "agent"
              ? "bg-panel text-ink"
              : "bg-accent-tint text-ink"
          )}
        >
          {line.text}
        </p>
      </div>
    </li>
  )
}

function ChatView({ c, lines, closed, edit }: {
  readonly c: StoreChat
  readonly lines: ReadonlyArray<StoreLine>
  readonly closed: boolean
  readonly edit: boolean
}) {
  const [text, setText] = useState("")
  const fieldId = useId()
  const known = c.customerId === undefined ? undefined : customer(c.customerId)
  const first = c.visitor.split(" ")[0] ?? c.visitor

  const send = () => {
    const body = text.trim()
    if (body === "") return
    addStoreLine(c.id, { from: "team", who: MY_KEY, at: nowClock(), text: body })
    setText("")
    toast({
      title: `Wordt over ${SEND_WINDOW_S} s verstuurd`,
      body: `${first} ziet het bericht in de chat op de winkel.`,
      duration: SEND_WINDOW_S * 1000,
      action: { label: "Niet versturen", onClick: () => dropStoreLine(c.id) }
    })
  }
  const close = () => {
    setStoreChatClosed(c.id, true)
    toast({
      title: "Gesprek gesloten",
      body: "Vraagt de bezoeker weer iets, dan neemt de agent het op.",
      action: { label: "Ongedaan maken", onClick: () => setStoreChatClosed(c.id, false) }
    })
  }
  const makeTicket = () => {
    const number = createTicket({
      customerId: c.customerId ?? "",
      handle: known?.email ?? `Bezoeker uit ${c.place}`,
      subject: c.about,
      channel: "winkelchat",
      status: "nieuw",
      priority: "gemiddeld",
      assignee: MY_KEY,
      labels: [],
      createdAt: nowClock(),
      waitingSince: nowClock(),
      unread: false,
      entries: lines.map((l) =>
        l.from === "visitor"
          ? { kind: "customer" as const, at: l.at, text: l.text }
          : l.from === "agent"
          ? { kind: "agent" as const, agentId: "waar-is-mijn-bestelling", at: l.at, text: l.text }
          : { kind: "team" as const, who: l.who ?? MY_KEY, at: l.at, text: l.text }
      )
    })
    setStoreChatClosed(c.id, true)
    toast({
      title: `Ticket #${number} gemaakt`,
      body: "Het gesprek staat erin; de chat is gesloten.",
      tone: "good",
      action: { label: "Openen", onClick: () => navigate(paths.ticket(number)) }
    })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 pb-2 sm:px-6">
          <Link
            to={paths.storeChat}
            aria-label="Terug naar de chats"
            className="-ml-1 inline-flex size-8 items-center justify-center rounded-sm text-ink-2 hover:bg-hover md:hidden pointer-coarse:size-11"
          >
            <ChevronLeft size={16} />
          </Link>
          <div className="flex min-w-48 flex-1 flex-col">
            <h1 className="truncate text-md font-semibold text-ink">{c.about}</h1>
            <p className="truncate text-xs text-ink-3">
              {c.visitor} · {c.place} · sinds <span className="figure">{c.startedAt}</span>
            </p>
          </div>
          {edit && !closed && (
            <div className="flex gap-2">
              <Button size="sm" icon={<TicketGlyph />} onClick={makeTicket}>Ticket maken</Button>
              <Button size="sm" icon={<CheckCircle />} onClick={close}>Sluiten</Button>
            </div>
          )}
        </header>

        <div className="pane-scroll min-h-0 flex-1">
          <div className="flex flex-col gap-5 px-4 pt-3 pb-6 sm:px-6">
            <p className="max-w-[62ch] text-sm text-pretty text-ink-2">
              <span className="font-medium text-ink">{closed ? "Afgehandeld" : "Overgedragen"}:</span> {c.summary}
            </p>
            <ol aria-label="Gesprek" className="flex flex-col gap-4">
              {lines.map((line, i) => <LineView key={i} line={line} visitor={c.visitor} />)}
            </ol>
            <aside aria-label="Bezoeker" className="flex flex-col gap-2 xl:hidden">
              <Visitor c={c} />
            </aside>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 sm:px-6">
          {!edit
            ? <ReadOnlyNotice area="support" />
            : closed
            ? <p className="rounded-md bg-well px-3 py-2.5 text-sm text-ink-2">Dit gesprek is gesloten.</p>
            : (
              <div className="flex items-end gap-2 rounded-lg bg-canvas p-2.5 ring-1 ring-line-strong ring-inset focus-within:ring-ink-4">
                <label htmlFor={fieldId} className="sr-only">Antwoord aan {first}</label>
                <textarea
                  id={fieldId}
                  rows={2}
                  value={text}
                  placeholder={`Antwoord aan ${first}`}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      send()
                    }
                  }}
                  className="min-h-12 w-full resize-none bg-transparent px-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-3"
                />
                <IconButton
                  label="Versturen"
                  disabled={text.trim() === ""}
                  onClick={send}
                  className="shrink-0 bg-ink text-on-ink hover:bg-ink/88 hover:text-on-ink pointer-coarse:size-11"
                >
                  <Send />
                </IconButton>
              </div>
            )}
        </div>
      </div>
      <aside
        aria-label="Bezoeker"
        className="pane-scroll hidden w-72 shrink-0 flex-col gap-2 bg-panel px-5 py-6 xl:flex"
      >
        <Visitor c={c} />
      </aside>
    </div>
  )
}

function Visitor({ c }: { readonly c: StoreChat }) {
  const known = c.customerId === undefined ? undefined : customer(c.customerId)
  return (
    <>
      <Heading>Bezoeker</Heading>
      {known === undefined
        ? <p className="text-sm text-ink-2">Niet ingelogd</p>
        : (
          <Link
            to={paths.customer(known.id)}
            className="text-sm font-medium text-ink underline-offset-2 hover:underline"
          >
            {known.name}
          </Link>
        )}
      <KeyValue
        items={[
          { label: "Waar", value: c.place },
          { label: "Bekijkt nu", value: c.page },
          { label: "In de winkelwagen", value: c.cart ?? "Leeg" },
          ...(known === undefined ? [] : [{ label: "Bestellingen", value: known.ordersCount, figure: true }])
        ]}
      />
    </>
  )
}
