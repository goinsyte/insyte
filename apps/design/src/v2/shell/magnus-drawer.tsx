import { useEffect, useState, useSyncExternalStore } from "react"
import { refByLabel } from "../ask/catalogue.ts"
import type { Ref } from "../ask/catalogue.ts"
import type { Question } from "../ask/scripts.ts"
import { MagnusThread } from "../ask/thread-view.tsx"
import { send, startChat } from "../ask/thread.ts"
import { ASSISTANT } from "../assistant.ts"
import { navigate, paths, useRoute } from "../router.tsx"
import { IconButton } from "../ui/button.tsx"
import { Composer } from "../ui/composer.tsx"
import { cx } from "../ui/cx.ts"
import { ArrowUp, Maximize, Plus, X } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { setDrawer, useShellState } from "./shell-state.ts"
import { noteChatAbout, threadFor } from "./threads.ts"
import type { Thread } from "./threads.ts"

/*
 * Magnus beside the work (⌘J): a drawer to the right of the page, so the question is asked next to
 * what it is about and the page stays in view. The conversation is Magnus's own (`ask/thread.ts`):
 * the drawer and the chat page show the same thread, it goes with you from page to page, and it
 * opens as a full page without starting again. The page's werkdraad item rides along as context,
 * and the chat is listed in that page's werkdraad afterwards.
 */

let current: string | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const useCurrent = () => useSyncExternalStore(subscribe, () => current)
function setCurrent(next: string | null) {
  current = next
  for (const listener of listeners) listener()
}

/** Ask in the drawer's conversation, or open one with this question, about the page's thing. */
function ask(question: Question, context: string | null) {
  if (current !== null) {
    send(current, question)
    return
  }
  const id = startChat(question)
  if (context !== null) noteChatAbout(id, context)
  setCurrent(id)
}

const aboutRefs = (context: string | null): ReadonlyArray<Ref> => {
  const ref = context === null ? undefined : refByLabel(context)
  return ref === undefined ? [] : [ref]
}

/** A question from elsewhere (the palette's last row): asked beside the page it was typed on. */
export function askBeside(text: string, thread: Thread) {
  ask({ text, about: aboutRefs(thread.ask) }, thread.ask)
  setDrawer(true)
}

/** Before the first message: what Magnus can start from here, and the composer. */
function Start({ context }: { readonly context: string | null }) {
  const [dropped, setDropped] = useState<string | null>(null)
  const attached = context !== null && dropped !== context ? context : null
  const about = aboutRefs(attached)
  const starters = [
    ...(attached === null ? [] : [`Wat moet ik weten over ${attached}?`, `Wat zou jij doen met ${attached}?`]),
    "Vat de open zaken van vandaag samen",
    "Welke bestellingen dreigen te laat te komen?",
    "Welke chargebacks hebben bewijs nodig?"
  ].slice(0, 3)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pane-scroll min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-4 pt-5 pb-6">
          <p className="text-sm text-pretty text-ink-2">
            {attached === null
              ? `Vraag ${ASSISTANT} iets over je winkel. Hij leest je bestellingen, tickets en cijfers zoals ze nu staan.`
              : `Je vraag gaat over ${attached}. ${ASSISTANT} leest wat eraan hangt.`}
          </p>
          <ul className="flex flex-col gap-px" aria-label="Begin met">
            {starters.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => ask({ text, about }, attached)}
                  className="group flex min-h-10 w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink"
                >
                  <span className="min-w-0 flex-1 text-pretty">{text}</span>
                  <ArrowUp size={14} className="shrink-0 rotate-45 text-ink-4 group-hover:text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="shrink-0 px-3 pb-3">
        <Composer
          autoFocus
          label={`Bericht aan ${ASSISTANT}`}
          placeholder={attached === null ? `Vraag ${ASSISTANT} iets` : `Vraag iets over ${attached}`}
          context={attached === null ? [] : [attached]}
          onRemoveContext={() => setDropped(context)}
          onSend={(text, extra) =>
            ask({
              text,
              refs: extra.refs,
              about,
              ...(extra.command === undefined ? {} : { command: extra.command })
            }, attached)}
        />
      </div>
    </div>
  )
}

/**
 * The drawer: beside the page from `lg` up (the page narrows, nothing is covered), over it below
 * that. Escape closes it while the focus is inside.
 */
export function MagnusDrawer() {
  const { route } = useRoute()
  const { drawer } = useShellState()
  const chatId = useCurrent()
  const thread = threadFor(route)
  const label = thread.items[0]?.label

  useEffect(() => {
    if (!drawer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      const box = document.getElementById("magnus-drawer")
      if (box?.contains(document.activeElement) === true) setDrawer(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [drawer])

  if (!drawer) return null
  return (
    <>
      <button
        type="button"
        aria-label={`${ASSISTANT} sluiten`}
        className="fixed inset-0 z-40 bg-scrim lg:hidden"
        onClick={() => setDrawer(false)}
      />
      <aside
        id="magnus-drawer"
        aria-label={ASSISTANT}
        className={cx(
          "z-40 flex w-[min(26rem,100vw)] shrink-0 animate-slide-in flex-col bg-canvas",
          "fixed inset-y-0 right-0 shadow-pop lg:relative lg:inset-auto lg:border-l lg:border-line lg:shadow-none"
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-2.5 pr-2 pl-4">
          <MagnusMark size={18} />
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="text-sm leading-tight font-semibold text-ink">{ASSISTANT}</h2>
            {label !== undefined && thread.ask !== null && (
              <p className="truncate text-2xs leading-tight text-ink-3">Naast {label}</p>
            )}
          </div>
          {chatId !== null && (
            <IconButton label="Nieuw gesprek" onClick={() => setCurrent(null)}>
              <Plus />
            </IconButton>
          )}
          <IconButton
            label="Als volledige pagina openen"
            onClick={() => {
              setDrawer(false)
              navigate(chatId === null ? paths.newChat(thread.ask ?? undefined) : paths.chat(chatId))
            }}
          >
            <Maximize />
          </IconButton>
          <IconButton label="Sluiten" onClick={() => setDrawer(false)}>
            <X />
          </IconButton>
        </header>
        {chatId === null
          ? <Start key={thread.ask ?? "geen"} context={thread.ask} />
          : <MagnusThread chatId={chatId} compact context={thread.ask === null ? [] : [thread.ask]} />}
      </aside>
    </>
  )
}
