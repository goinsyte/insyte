import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { toast } from "sonner"
import type { ChatAction, ChatRecordRef } from "../../data-source"
import { AlertTriangle, Check, Loader, Sparkle, Undo2, Zap } from "../../icons"
import { useNow } from "../ask/agent-parts"
import { leftLabel } from "../lib/agent-log"
import { cn } from "../lib/utils"
import { blocked, COMMAND, doneLine, pendingLine } from "./commands"
import { RecordLines } from "./record-views"
import type { ChatRecord } from "./records"
import { useChatsSource } from "./source"

/*
 * An action said in the conversation, drawn where the team reads. One card follows it from the
 * question to the result: a person's money command waits for its own confirm, Insyte's proposal
 * waits for a yes, and once it ran the card says what changed and keeps Ongedaan maken open for
 * five minutes. The record it touched sits inside the card, live, so a refund shows as refunded.
 */

const EASE = [0.16, 1, 0.3, 1] as const

export function ActionCard(
  { action: a, by, onOpen }: {
    action: ChatAction
    /** Who ran a person's command: "Jij", or their name. */
    by: string
    onOpen: (r: ChatRecordRef) => void
  }
) {
  const r = useChatsSource().useRecord(a.target)
  const reduce = useReducedMotion() ?? false
  const command = COMMAND[a.command]
  const settled = a.state === "done" || a.state === "undone" || a.state === "declined" || a.state === "failed"
  const line = a.state === "done" || a.state === "undone" ? doneLine(a, r) : pendingLine(a, r)
  const fromInsyte = a.by === "insyte"

  return (
    <motion.div
      layout={!reduce}
      transition={{ duration: 0.3, ease: EASE }}
      className={cn(
        "mt-1 flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl",
        a.state === "proposed" || a.state === "confirm"
          ? "bg-paper shadow-[0_0_0_1.5px_var(--color-arc),0_8px_24px_-12px_color-mix(in_oklch,var(--color-arc)_45%,transparent)]"
          : "bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.06),0_4px_14px_-8px_rgb(0_0_0/0.18)]"
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-3.5 py-2.5", settled ? "bg-mist/70" : "bg-arc-tint")}>
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md",
            fromInsyte ? "bg-abyss text-mesh-ink" : "bg-arc text-mesh-ink"
          )}
        >
          {fromInsyte ? <Sparkle className="size-3.5" strokeWidth={2} /> : <Zap className="size-3.5" strokeWidth={2} />}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-base",
            a.state === "undone" ? "text-ink-3 line-through decoration-ink-4" : "text-ink"
          )}
        >
          {line}
        </span>
        <StateWord a={a} />
      </div>

      {r ?
        (
          <button
            type="button"
            onClick={() => onOpen(r.ref)}
            className="flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-arc-tint/40"
          >
            <RecordLines r={r} />
          </button>
        ) :
        null}
      {a.arg && (a.command === "note" || a.command === "ticket")
        ? <p className="px-3.5 pb-2.5 text-ink/90 text-sm leading-normal">“{a.arg}”</p>
        : null}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={a.state}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          <Footer a={a} r={r} by={by} commandLabel={command.label} />
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

function StateWord({ a }: { a: ChatAction }) {
  if (a.state === "running") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-arc-ink text-sm">
        <Loader className="size-3.5 animate-spin" strokeWidth={2} />
        Bezig
      </span>
    )
  }
  if (a.state === "done") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-ink-2 text-sm">
        <Check className="size-3.5 text-arc-ink" strokeWidth={2.25} />
        Gedaan
      </span>
    )
  }
  if (a.state === "proposed") {
    return (
      <Link
        to="/settings/ai/autonomy"
        search={{ actie: COMMAND[a.command].agent } as never}
        className="shrink-0 rounded-md bg-paper px-1.5 py-0.5 font-medium text-arc-ink text-xs hover:bg-paper/70"
      >
        Eerst vragen
      </Link>
    )
  }
  if (a.state === "confirm") return <span className="shrink-0 font-medium text-arc-ink text-xs">Bevestigen</span>
  if (a.state === "undone") return <span className="shrink-0 text-ink-3 text-sm">Ongedaan</span>
  if (a.state === "declined") return <span className="shrink-0 text-ink-3 text-sm">Afgewezen</span>
  return (
    <span className="flex shrink-0 items-center gap-1 text-ink-2 text-sm">
      <AlertTriangle className="size-3.5 text-signal-red" strokeWidth={2} />
      Niet gelukt
    </span>
  )
}

function Footer(
  { a, r, by, commandLabel }: { a: ChatAction; r: ChatRecord | null; by: string; commandLabel: string }
) {
  const source = useChatsSource()
  const [busy, setBusy] = useState(false)
  const why = a.state === "confirm" || a.state === "proposed" ? blocked(a.command, r, a.arg, source.rules) : undefined

  async function go() {
    setBusy(true)
    const fail = await source.writes.confirm(a, r)
    setBusy(false)
    if (fail) toast.error(fail)
  }

  if (a.state === "confirm" || a.state === "proposed") {
    return (
      <div className="flex flex-wrap items-center gap-2 px-3.5 pt-1 pb-3">
        <button
          type="button"
          disabled={busy || Boolean(why)}
          onClick={() => void go()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {a.state === "proposed" ? "Goedkeuren" : commandLabel}
        </button>
        <button
          type="button"
          onClick={() => source.writes.decline(a)}
          className="flex h-8 items-center rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
        >
          {a.state === "proposed" ? "Afwijzen" : "Annuleren"}
        </button>
        <span className="min-w-0 flex-1 truncate text-right text-ink-3 text-sm">
          {why ?? (a.state === "confirm" ? "Gaat over geld, dus eerst jouw ja" : "")}
        </span>
      </div>
    )
  }
  if (a.state === "done") return <DoneFooter a={a} by={by} />
  if (a.state === "failed") {
    return <p className="px-3.5 pt-1 pb-3 text-ink-2 text-sm">{a.error ?? "Er ging iets mis. Probeer het opnieuw."}</p>
  }
  if (a.state === "declined") {
    return (
      <p className="px-3.5 pt-1 pb-3 text-ink-3 text-sm">
        Afgewezen door {a.decidedBy ?? "het team"}. Er is niets veranderd.
      </p>
    )
  }
  if (a.state === "undone") return <p className="px-3.5 pt-1 pb-3 text-ink-3 text-sm">Teruggezet zoals het was.</p>
  return <div className="h-2" />
}

function DoneFooter({ a, by }: { a: ChatAction; by: string }) {
  const { writes } = useChatsSource()
  const now = useNow(1000)
  const left = (a.undoUntil ?? 0) - now
  const open = left > 0 && writes.canUndo(a)
  const who = a.by === "insyte"
    ? (a.level === "auto" ? "Insyte, op Zelf doen" : `Insyte, goedgekeurd door ${a.decidedBy ?? "jou"}`)
    : by
  return (
    <div className="flex items-center gap-2 px-3.5 pt-1 pb-3">
      <span className="min-w-0 flex-1 truncate text-ink-3 text-sm">{who}</span>
      {open ?
        (
          <button
            type="button"
            onClick={() => {
              void writes.undo(a).then((ok) => {
                if (ok) toast("Ongedaan gemaakt")
              })
            }}
            className="flex h-7 items-center gap-1.5 rounded-md bg-arc-tint px-2.5 font-medium text-arc-ink text-sm transition-colors hover:bg-arc/15"
          >
            <Undo2 className="size-3.5" strokeWidth={2} />
            Ongedaan maken
            <span className="text-arc-ink/70 tabular-nums">{leftLabel(left).replace("nog ", "")}</span>
          </button>
        ) :
        null}
    </div>
  )
}
