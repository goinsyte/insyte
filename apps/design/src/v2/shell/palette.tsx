import { useMemo } from "react"
import { useStartedChats } from "../ask/thread.ts"
import { ASK_ASSISTANT, ASSISTANT } from "../assistant.ts"
import { AGENTS } from "../fixtures/agents.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { HIT_GROUP, searchRecords } from "../fixtures/search.ts"
import type { HitKind } from "../fixtures/search.ts"
import { navigate, paths, useRoute } from "../router.tsx"
import { CommandPalette } from "../ui/command.tsx"
import type { Command } from "../ui/command.tsx"
import {
  BarChart3,
  Clock,
  CreditCard,
  Factory,
  Keyboard,
  LayoutGrid,
  MessageSquare,
  Package,
  Pin,
  Returns,
  Settings,
  ShoppingBag,
  Sparkle,
  Ticket,
  User,
  Workflow
} from "../ui/icons.tsx"
import { Kbd } from "../ui/kbd.tsx"
import { toast } from "../ui/toast.tsx"
import { level, useView } from "../view.ts"
import type { PermArea } from "../view.ts"
import { CREATE_ITEMS, createBlocked } from "./create.ts"
import { askBeside } from "./magnus-drawer.tsx"
import { SECTIONS, sectionVisible, TOOLS } from "./sections.ts"
import { closeOverlay, isPinned, openOverlay, pin, setDrawer, unpin, useShellState } from "./shell-state.ts"
import type { Shortcut } from "./shell-state.ts"
import { threadFor } from "./threads.ts"
import type { ThreadKind } from "./threads.ts"

/**
 * ⌘K: the one field for everything. Empty, it offers what you reach for (Magnus, the things you
 * can make, what you pinned and opened lately, the areas); typed into, it searches every record of
 * the workspace, a few per kind with the rest counted, and what it cannot find goes to Magnus. A
 * kind of record the role may not open is not searched; a thing it may not make says why.
 */

const HIT_GLYPH: Readonly<Record<HitKind, Glyph>> = {
  order: ShoppingBag,
  return: Returns,
  customer: User,
  ticket: Ticket,
  chat: MessageSquare,
  chargeback: CreditCard,
  product: Package,
  supplier: Factory
}

const HIT_AREA: Readonly<Partial<Record<HitKind, PermArea>>> = {
  order: "orders",
  return: "returns",
  customer: "customers",
  ticket: "support",
  chargeback: "chargebacks",
  product: "products",
  supplier: "suppliers"
}

/** The glyph a pinned or recent thing is drawn with, by what the werkdraad says it is. */
export const KIND_GLYPH: Readonly<Partial<Record<ThreadKind, Glyph>>> = {
  order: ShoppingBag,
  return: Returns,
  customer: User,
  ticket: Ticket,
  chargeback: CreditCard,
  product: Package,
  supplier: Factory,
  automation: Workflow,
  board: BarChart3,
  chat: MessageSquare,
  agent: Sparkle,
  setting: Settings
}

/** The kinds of page worth pinning and remembering: a record, a board, a conversation. */
export const RECORD_KINDS: ReadonlySet<ThreadKind> = new Set([
  "order",
  "return",
  "customer",
  "ticket",
  "chargeback",
  "product",
  "supplier",
  "automation",
  "affiliate",
  "course",
  "sheet",
  "board",
  "chat",
  "agent"
])

const ORDER: ReadonlyArray<HitKind> = [
  "order",
  "return",
  "customer",
  "ticket",
  "chat",
  "chargeback",
  "product",
  "supplier"
]

const shortcutCommand = (group: string, item: Shortcut, meta?: string): Command => ({
  id: `${group}-${item.href}`,
  label: item.label,
  group,
  glyph: KIND_GLYPH[item.kind] ?? LayoutGrid,
  meta,
  run: () => navigate(item.href)
})

export function Palette() {
  const { overlay, pins, recent } = useShellState()
  const started = useStartedChats()
  const view = useView()
  const { route, pathname } = useRoute()
  const open = overlay === "palette"
  const here = threadFor(route).items[0]
  const pinnable = here !== undefined && RECORD_KINDS.has(here.kind)

  const commands = useMemo((): ReadonlyArray<Command> => {
    if (!open) return []
    const actions: ReadonlyArray<Command> = [
      {
        id: "ask",
        label: ASK_ASSISTANT,
        group: "Acties",
        glyph: Sparkle,
        meta: "naast je werk",
        shortcut: ["⌘", "J"],
        keywords: "magnus vraag ai assistent",
        run: () => setDrawer(true)
      },
      ...CREATE_ITEMS.map((item): Command => {
        const blocked = createBlocked(view, item)
        return {
          id: `new-${item.kind}`,
          label: item.newLabel,
          group: "Acties",
          glyph: item.glyph,
          keywords: "nieuw maken starten",
          disabled: blocked ?? undefined,
          run: () => navigate(item.href)
        }
      }),
      ...(pinnable
        ? [
          {
            id: "pin-here",
            label: isPinned(pathname) ? `${here.label} losmaken` : `${here.label} vastzetten`,
            group: "Acties",
            glyph: Pin,
            keywords: "vastzetten pin bladwijzer",
            run: () => {
              if (isPinned(pathname)) {
                unpin(pathname)
                toast({ title: `${here.label} losgemaakt` })
              } else {
                pin({ href: pathname, label: here.label, kind: here.kind })
                toast({
                  title: `${here.label} vastgezet`,
                  body: "Je vindt het op Start en hier, onder Vastgezet.",
                  tone: "good"
                })
              }
            }
          } satisfies Command
        ]
        : []),
      {
        id: "shortcuts",
        label: "Sneltoetsen",
        group: "Acties",
        glyph: Keyboard,
        shortcut: "?",
        run: () => openOverlay("shortcuts")
      },
      {
        id: "customise",
        label: "Zijbalk aanpassen",
        group: "Acties",
        glyph: LayoutGrid,
        keywords: "rail menu volgorde verbergen",
        run: () => openOverlay("customise")
      }
    ]
    const pinned = pins.map((p) => shortcutCommand("Vastgezet", p))
    const recents = recent
      .filter((r) => r.href !== pathname)
      .slice(0, 5)
      .map((r) => shortcutCommand("Recent", r, undefined))
    // Conversations started this visit, beside a page or on the chat page, before the written ones.
    const fresh = started.map((c): Command => ({
      id: `magnus-${c.id}`,
      label: c.title,
      group: HIT_GROUP.chat,
      glyph: HIT_GLYPH.chat,
      meta: `Gesprek met ${ASSISTANT} · ${c.started}`,
      searchOnly: true,
      run: () => navigate(paths.chat(c.id))
    }))
    const records = searchRecords(view.staat)
      .filter((hit) => {
        const area = HIT_AREA[hit.kind]
        return area === undefined || level(view, area) > 0
      })
      .toSorted((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
      .map((hit): Command => ({
        id: hit.id,
        label: hit.label,
        group: HIT_GROUP[hit.kind],
        glyph: HIT_GLYPH[hit.kind],
        meta: hit.meta,
        keywords: hit.keywords,
        searchOnly: true,
        run: () => navigate(hit.href)
      }))
    const places: ReadonlyArray<Command> = [
      ...SECTIONS.filter((s) => sectionVisible(view, s.id)).map((s): Command => ({
        id: `go-${s.id}`,
        label: s.label,
        group: "Ga naar",
        glyph: s.glyph ?? Sparkle,
        run: () => navigate(s.href)
      })),
      ...TOOLS.filter((t) => sectionVisible(view, t.id)).map((t): Command => ({
        id: `go-${t.id}`,
        label: t.label,
        group: "Ga naar",
        glyph: t.glyph ?? LayoutGrid,
        meta: t.detail,
        run: () => navigate(t.href)
      })),
      {
        id: "go-approvals",
        label: "Goedkeuringen",
        group: "Ga naar",
        glyph: Clock,
        meta: `voorstellen van ${ASSISTANT}`,
        run: () => navigate(paths.approvals)
      },
      {
        id: "go-settings",
        label: "Instellingen",
        group: "Ga naar",
        glyph: Settings,
        run: () => navigate(paths.settings())
      },
      {
        id: "go-kit",
        label: "Onderdelen",
        group: "Ga naar",
        glyph: LayoutGrid,
        keywords: "kit ui componenten",
        run: () => navigate(paths.parts)
      }
    ]
    const agents = AGENTS.map((agent): Command => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      group: "Agents",
      glyph: agent.glyph,
      searchOnly: true,
      run: () => navigate(paths.agent(agent.id))
    }))
    return [...actions, ...pinned, ...recents, ...fresh, ...records, ...places, ...agents]
  }, [open, view, pins, recent, started, pathname, pinnable, here])

  return (
    <CommandPalette
      open={open}
      onClose={closeOverlay}
      commands={commands}
      perGroup={5}
      placeholder="Zoek een bestelling, klant, ticket of chat, of typ een vraag"
      foot={
        <>
          <Kbd>?</Kbd> sneltoetsen
        </>
      }
      askLabel={(query) => <>{ASK_ASSISTANT}: ‘{query}’</>}
      onAsk={(query) => askBeside(query, threadFor(route))}
    />
  )
}
