import { ASK_ASSISTANT } from "../assistant.ts"
import type { Glyph } from "../fixtures/agents.ts"
import { Link } from "../router.tsx"
import { Avatar } from "../ui/avatar.tsx"
import { cx } from "../ui/cx.ts"
import {
  BadgePercent,
  BarChart3,
  CreditCard,
  Factory,
  GraduationCap,
  MessageSquare,
  Package,
  Returns,
  Settings,
  Sheet,
  ShoppingBag,
  Sparkle,
  Ticket,
  User,
  Workflow
} from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { askMagnus, useShellState } from "./shell-state.ts"
import type { Thread, ThreadItem, ThreadKind } from "./threads.ts"

const GLYPH: Partial<Record<ThreadKind, Glyph>> = {
  chat: MessageSquare,
  agent: Sparkle,
  product: Package,
  supplier: Factory,
  board: BarChart3,
  order: ShoppingBag,
  customer: User,
  ticket: Ticket,
  return: Returns,
  chargeback: CreditCard,
  automation: Workflow,
  affiliate: BadgePercent,
  course: GraduationCap,
  sheet: Sheet,
  setting: Settings
}

/**
 * The werkdraad in the main bar: the thing you are working on, then what it touches, joined by a
 * short ruled thread, ending in "Vraag Magnus" with that context. On a narrow bar the related records
 * fold away first, then their clauses; the thing itself always stays.
 *
 * "Vraag Magnus" (and ⌘J from anywhere, `keys.ts`) opens him beside the work with this screen as
 * the context; pressed again, he closes.
 */
export function Werkdraad({ thread }: { readonly thread: Thread }) {
  const [current, ...related] = thread.items
  const { drawer } = useShellState()
  if (current === undefined) return null
  return (
    <nav aria-label="Werkdraad" className="flex min-w-0 items-center">
      <ol className="flex min-w-0 items-center">
        <li className="flex min-w-0 items-center">
          <span aria-current="page" className="flex min-w-0 items-center gap-1.5 px-1.5 text-sm font-medium text-ink">
            <ItemMark item={current} />
            <span className="truncate">{current.label}</span>
          </span>
        </li>
        {related.map((item, i) => (
          <li
            key={`${item.kind}-${item.label}`}
            className={cx(
              "min-w-0 items-center",
              i >= 2 ? "hidden 2xl:flex" : i >= 1 ? "hidden xl:flex" : "hidden lg:flex"
            )}
          >
            <Joint />
            <Related item={item} />
          </li>
        ))}
      </ol>
      {thread.ask !== null && (
        <>
          <Joint />
          <button
            type="button"
            onClick={askMagnus}
            aria-expanded={drawer}
            aria-controls="magnus-drawer"
            aria-keyshortcuts="Meta+J Control+J"
            title={`${ASK_ASSISTANT} (⌘J)`}
            className={cx(
              "flex shrink-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm font-medium whitespace-nowrap text-ai-ink hover:bg-hover",
              drawer && "bg-selected"
            )}
          >
            <MagnusMark size={15} />
            <span className="hidden sm:inline">{ASK_ASSISTANT}</span>
            <span className="figure hidden text-2xs font-normal text-ink-3 xl:inline">⌘J</span>
          </button>
        </>
      )}
    </nav>
  )
}

/** The thread between two items: a short hairline, not a chevron, because these are ties, not a path. */
function Joint() {
  return <span aria-hidden="true" className="mx-1 h-px w-3 shrink-0 bg-line-strong" />
}

function ItemMark({ item }: { readonly item: ThreadItem }) {
  if (item.kind === "magnus") return <MagnusMark size={15} />
  if (item.kind === "person") return <Avatar name={item.label} size={18} />
  const G = GLYPH[item.kind]
  return G === undefined ? null : <G size={15} className="shrink-0 text-ink-3" />
}

function Related({ item }: { readonly item: ThreadItem }) {
  const body = (
    <>
      <ItemMark item={item} />
      <span className="truncate">{item.label}</span>
      {item.meta !== undefined && <span className="hidden truncate text-ink-3 xl:inline">· {item.meta}</span>}
    </>
  )
  return (
    <span className="group relative flex min-w-0 items-center">
      {item.href === undefined
        ? <span className="flex min-w-0 items-center gap-1.5 px-1.5 py-1 text-sm text-ink-2">{body}</span>
        : (
          <Link
            to={item.href}
            className="flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm text-ink-2 hover:bg-hover hover:text-ink"
          >
            {body}
          </Link>
        )}
      {item.peek !== undefined && (
        <span
          role="tooltip"
          className={cx(
            "pointer-events-none invisible absolute top-full left-0 z-30 mt-1.5 w-64 translate-y-1 rounded-md bg-canvas p-3 opacity-0 shadow-pop ring-1 ring-line",
            "transition-[opacity,transform,visibility] duration-150 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100",
            "group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
          )}
        >
          <span className="block text-sm font-medium text-ink">{item.label}</span>
          {item.peek.map((line) => <span key={line} className="mt-1 block text-xs text-ink-2">{line}</span>)}
        </span>
      )}
    </span>
  )
}
