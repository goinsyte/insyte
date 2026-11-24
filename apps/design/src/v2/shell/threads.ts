import { AREAS } from "../areas.ts"
import { findChat } from "../ask/thread.ts"
import { getDemo, openStoreChats } from "../demo.ts"
import { AGENTS } from "../fixtures/agents.ts"
import { BOARDS } from "../fixtures/analytics.ts"
import { PEOPLE, RECORDS } from "../fixtures/workspace.ts"
import { paths } from "../router.tsx"
import type { Route } from "../router.tsx"
import { sectionLabel } from "./sections.ts"

/**
 * The werkdraad (work thread): for every screen, what you are working on and what it touches.
 *
 * The first item is the thing itself. The ones after it are the records it is tied to (the supplier
 * of a product, the colleague who last changed it, the place an agent works), each a link with a peek.
 * `ask` is what "Vraag Magnus" carries into a new chat, so the assistant starts from the same context.
 *
 * In the product this comes from the record's relations; here it is written per screen.
 */

export type ThreadKind =
  | "page"
  | "chat"
  | "agent"
  | "product"
  | "supplier"
  | "person"
  | "board"
  | "magnus"
  | "order"
  | "customer"
  | "ticket"
  | "return"
  | "chargeback"
  | "automation"
  | "affiliate"
  | "course"
  | "sheet"
  | "setting"

export type ThreadItem = {
  readonly kind: ThreadKind
  readonly label: string
  readonly href?: string
  /** A short clause after the label: "wijzigde de maattabel · 3 d". */
  readonly meta?: string
  /** What a hover or focus shows before you leave the screen. */
  readonly peek?: ReadonlyArray<string>
}

export type Thread = { readonly items: ReadonlyArray<ThreadItem>; readonly ask: string | null }

const person = (who: keyof typeof PEOPLE, meta: string, peek?: ReadonlyArray<string>): ThreadItem => ({
  kind: "person",
  label: PEOPLE[who].name,
  href: paths.person(PEOPLE[who].id),
  meta,
  peek: peek ?? [PEOPLE[who].role]
})

/** Chats started beside a page this visit (the ⌘J drawer), by the werkdraad item they were about. */
const besides = new Map<string, Array<string>>()

/** Remember that a chat began beside the page whose werkdraad asks about `about`. */
export function noteChatAbout(chatId: string, about: string) {
  besides.set(about, [chatId, ...(besides.get(about) ?? [])])
}

/**
 * The werkdraad for a screen: what it is written as, followed by the chats with Magnus started
 * beside it this visit, newest first, so a conversation about this order is one click from it.
 */
export function threadFor(route: Route): Thread {
  const base = writtenThread(route)
  const ids = base.ask === null ? undefined : besides.get(base.ask)
  if (ids === undefined) return base
  const chats = ids.flatMap((id) => {
    const chat = findChat(id)
    return chat === undefined
      ? []
      : [{ kind: "chat" as const, label: chat.title, href: paths.chat(id), meta: "vandaag" }]
  })
  return { ...base, items: [...base.items, ...chats] }
}

function writtenThread(route: Route): Thread {
  switch (route.name) {
    case "home":
      return {
        items: [
          { kind: "page", label: "Vandaag" },
          { kind: "supplier", ...RECORDS.kestrel, meta: "6 vertraagd" },
          person("sofia", "neemt de inbox", ["CX-lead", "Online · 4 tickets open"])
        ],
        ask: "Vandaag"
      }
    case "new-chat":
      return {
        items: [
          { kind: "magnus", label: "Nieuwe chat" },
          ...(route.context === null ? [] : [{ kind: "page" as const, label: route.context, meta: "als context" }])
        ],
        ask: null
      }
    case "chat": {
      const chat = findChat(route.chatId)
      const title = chat === undefined ? "Chat" : getDemo().chatTitles[chat.id] ?? chat.title
      if (chat?.id !== "terugbetalingen") return { items: [{ kind: "chat", label: title }], ask: null }
      return {
        items: [
          { kind: "chat", label: title },
          { kind: "product", ...RECORDS.aurora },
          { kind: "supplier", ...RECORDS.allure, meta: "leverancier" },
          person("sofia", "wijzigde de maattabel · 3 d", ["CX-lead", "Wijzigde de maattabel van de Aurora op 20 nov"])
        ],
        ask: null
      }
    }
    case "log":
      return {
        items: [
          { kind: "page", label: "Logboek" },
          { kind: "page", label: "Mijn agents", href: paths.agents, meta: "wie het deed" }
        ],
        ask: "Logboek van de agents"
      }
    case "agents":
      return {
        items: [
          { kind: "page", label: "Mijn agents" },
          {
            kind: "agent",
            label: "Retouragent",
            href: paths.agent("retouragent"),
            meta: "wacht op jou",
            peek: ["Wil een omruiling aanbieden aan Astrid Berg", "Eerst vragen · sinds 13:47"]
          },
          { kind: "page", ...RECORDS.inbox, meta: "waar ze werken" }
        ],
        ask: "Mijn agents"
      }
    case "agent": {
      const agent = AGENTS.find((a) => a.id === route.agentId)
      if (agent === undefined) return { items: [{ kind: "page", label: "Agent" }], ask: null }
      return {
        items: [
          { kind: "agent", label: agent.name },
          { kind: "page", ...RECORDS.inbox, meta: "werkt hier" },
          person("sofia", "wijzigde de instructies · 2 min", ["CX-lead", "Wijzigde ‘Wanneer je overdraagt’"]),
          person("elena", "beheerder")
        ],
        ask: `Agent ${agent.name}`
      }
    }
    case "board": {
      // Making a board or choosing a template is Analyse itself, not one of its boards.
      if (route.boardId === "nieuw" || route.boardId === "sjablonen") {
        const label = route.boardId === "nieuw" ? "Nieuw bord" : "Sjablonen voor borden"
        return { items: [{ kind: "page", label: "Analyse" }, { kind: "page", label }], ask: label }
      }
      const known = BOARDS.find((b) => b.id === route.boardId)
      // A board of your own (kept in this browser) is yours, about what you put on it.
      if (known === undefined && route.boardId !== null) {
        return {
          items: [{ kind: "board", label: "Eigen bord" }, person("elena", "eigenaar")],
          ask: "Eigen bord"
        }
      }
      const board = known ?? BOARDS[0]
      const owner = person(board?.owner === "Sofía Kim" ? "sofia" : "elena", "eigenaar")
      // What a board touches depends on what it is about: the product that stands out this week, or
      // the supplier that misses its promise.
      const touches: ReadonlyArray<ThreadItem> = board?.id === "leveranciers"
        ? [{ kind: "supplier", ...RECORDS.kestrel, meta: "haalt de belofte niet" }]
        : board?.id === "retouren"
        ? [
          { kind: "product", ...RECORDS.aurora, meta: "26 terug" },
          { kind: "supplier", ...RECORDS.allure, meta: "leverde de S" }
        ]
        : [{ kind: "product", ...RECORDS.aurora, meta: "valt op afgelopen week" }]
      return {
        items: [{ kind: "board", label: board?.name ?? "Analyse" }, owner, ...touches],
        ask: `Bord ${board?.name ?? "Analyse"}`
      }
    }
    case "live":
      return {
        items: [
          { kind: "page", label: "Live" },
          { kind: "product", ...RECORDS.aurora, meta: "nu het meest bekeken" },
          person("sofia", "op de winkelchat", ["CX-lead", `${openStoreChats()} chats open op de winkel`])
        ],
        ask: "Live"
      }
    case "parts":
      return {
        items: [{ kind: "page", label: "Onderdelen: de UI-kit van versie 2" }],
        ask: null
      }
    case "brand":
      return { items: [{ kind: "page", label: "Merk" }], ask: null }
    case "more":
      return { items: [{ kind: "page", label: "Meer" }], ask: null }
    case "area":
      return AREAS[route.area].thread(route)
    case "soon":
      return { items: [{ kind: "page", label: sectionLabel(route.section) }], ask: sectionLabel(route.section) }
  }
}

/** Which rail area a route belongs to. */
export function sectionOf(route: Route): string {
  switch (route.name) {
    case "home":
      return "start"
    case "new-chat":
    case "chat":
    case "agents":
    case "agent":
    case "log":
      return "magnus"
    case "board":
      return "analyse"
    case "live":
      return "live"
    case "parts":
    case "brand":
    case "more":
      return "meer"
    case "area":
      return route.section
    case "soon":
      return route.section
  }
}
