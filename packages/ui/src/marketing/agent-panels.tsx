import { AnimatePresence, motion } from "motion/react"
import { Check, Lock, Sparkle, Undo2 } from "../icons.tsx"
import { cn } from "../lib/utils.ts"

/*
 * The agent's two planned screens, drawn for the marketing site: Instellingen → Insyte AI →
 * Zelfstandigheid (one level per action) and the agent's log (what it did, under which setting,
 * what it read, with Ongedaan maken). Neither is built: ADR-0027 and docs/PLAN.md items 29 and 30
 * design them, so every place that shows these panels labels them "Binnenkort".
 *
 * The defaults are ADR-0027's: internal bookkeeping may run on its own, money and customer contact
 * ask first, an evidence submission always asks. The log is the settled workspace (Northwind
 * Clothing Co.): Daniel Okafor's two messages about SO-12224 from the Ask demo, the ticket assigned
 * to Amber Lewis (Klantenservice), the reply to Daniel waiting on Eerst vragen.
 */

export type Level = "auto" | "ask" | "never"

const LEVELS: ReadonlyArray<{ readonly id: Level; readonly label: string }> = [
  { id: "auto", label: "Zelf doen" },
  { id: "ask", label: "Eerst vragen" },
  { id: "never", label: "Nooit" }
]

export const AUTONOMY: ReadonlyArray<{ readonly action: string; readonly level: Level; readonly locked?: true }> = [
  { action: "Status en prioriteit", level: "auto" },
  { action: "Ticket toewijzen", level: "auto" },
  { action: "Notitie toevoegen", level: "auto" },
  { action: "Klant beantwoorden", level: "ask" },
  { action: "Terugbetalen", level: "ask" },
  { action: "Bewijs indienen bij Klarna", level: "ask", locked: true }
]

/** The per-action setting. `flip` moves "Ticket toewijzen" from Eerst vragen to Zelf doen, as an operator would. */
export function AutonomyPanel({ flip = true }: { readonly flip?: boolean }) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-paper text-left window-lift">
      <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
        <span className="font-medium text-ink text-sm">Zelfstandigheid</span>
        <span className="ml-auto text-ink-3 text-xs">Insyte AI · instellingen</span>
      </div>
      <ul className="flex flex-col p-2">
        {AUTONOMY.map((row) => {
          const level: Level = row.action === "Ticket toewijzen" && !flip ? "ask" : row.level
          return (
            <li key={row.action} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md px-2.5 py-2">
              <span className="min-w-[7.5rem] flex-1 text-ink text-sm">{row.action}</span>
              {row.locked === true
                ? (
                  <span className="flex h-7 items-center gap-1.5 rounded-md bg-mist px-2.5 text-ink-2 text-xs">
                    <Lock size={12} />
                    Vraagt altijd
                  </span>
                )
                : (
                  <span className="flex rounded-md bg-mist p-0.5 text-xs">
                    {LEVELS.map((l) => (
                      <span
                        key={l.id}
                        className={cn(
                          "flex h-6 items-center rounded-[5px] px-1.5 transition-colors duration-300",
                          l.id === level ? "bg-abyss text-mesh-ink" : "text-ink-3"
                        )}
                      >
                        {l.label}
                      </span>
                    ))}
                  </span>
                )}
            </li>
          )
        })}
      </ul>
      <div className="bg-mist px-4 py-3 text-ink-2 text-xs">
        Geld en klantcontact staan standaard op Eerst vragen. Wat niet terug kan, vraagt altijd.
      </div>
    </div>
  )
}

type LogRow = {
  readonly at: string
  readonly what: string
  readonly subject: string
  readonly level: Level
}

const LOG: ReadonlyArray<LogRow> = [
  { at: "09:42", what: "Ticket toegewezen aan Amber Lewis", subject: "Daniel Okafor · SO-12224", level: "auto" },
  { at: "09:42", what: "Notitie toegevoegd", subject: "SO-12224", level: "auto" },
  { at: "09:41", what: "Antwoord aan Daniel opgesteld", subject: "Daniel Okafor", level: "ask" }
]

/** The log: the newest action open, with what it read, why, and Ongedaan maken; `undone` shows it taken back. */
export function AgentLogPanel(
  { fresh = false, undone = false }: { readonly fresh?: boolean; readonly undone?: boolean }
) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-paper text-left window-lift">
      <div className="flex items-center gap-2 px-4 py-3 shadow-[inset_0_-1px_0_var(--hairline)]">
        <span className="flex size-5 items-center justify-center rounded-sm bg-abyss text-mesh-ink">
          <Sparkle size={11} />
        </span>
        <span className="font-medium text-ink text-sm">Wat Insyte deed</span>
        <span className="ml-auto text-ink-3 text-xs">Vandaag</span>
      </div>
      <ul className="flex flex-col">
        {LOG.map((row, i) => {
          const top = i === 0
          return (
            <li
              key={row.what}
              className={cn(
                "flex flex-col gap-2 px-4 py-3 transition-colors duration-500",
                i > 0 && "border-hairline border-t",
                top && fresh && !undone && "bg-arc-tint"
              )}
            >
              <span className="flex items-start gap-3">
                <span className="w-10 shrink-0 pt-px text-ink-3 text-xs tabular-nums">{row.at}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("text-ink text-sm", top && undone && "text-ink-3 line-through")}>
                    {row.what}
                  </span>
                  <span className="truncate text-ink-3 text-xs">{row.subject}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-sm px-1.5 py-0.5 text-xs",
                    row.level === "auto" ? "bg-mist text-ink-2" : "bg-arc-tint text-arc-ink"
                  )}
                >
                  {row.level === "auto" ? "Zelf doen" : "Wacht op jou"}
                </span>
              </span>
              {top
                ? (
                  <span className="flex flex-col gap-2 pl-[52px]">
                    <span className="text-ink-2 text-xs">
                      Waarom: een vraag over een vertraagde levering, en Amber behandelt de klantenservice vandaag.
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {["Las 2 berichten", "Las 1 track & trace-update"].map((s) => (
                        <span
                          key={s}
                          className="flex items-center gap-1 rounded-sm bg-mist px-1.5 py-0.5 text-ink-2 text-xs"
                        >
                          <Check size={11} />
                          {s}
                        </span>
                      ))}
                    </span>
                    <AnimatePresence mode="wait" initial={false}>
                      {undone
                        ? (
                          <motion.span
                            key="terug"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-7 items-center text-ink-3 text-xs"
                          >
                            Ongedaan gemaakt door Elena Hart · het ticket is weer niet toegewezen
                          </motion.span>
                        )
                        : (
                          <motion.span
                            key="knop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex h-7 w-fit items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-xs field"
                          >
                            <Undo2 size={12} />
                            Ongedaan maken
                          </motion.span>
                        )}
                    </AnimatePresence>
                  </span>
                )
                : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The "not built yet" mark, in the site's dashed style, for a light or a dark ground. */
export function SoonTag({ dark = false, label = "binnenkort" }: { readonly dark?: boolean; readonly label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border border-dashed px-2 py-0.5 font-normal text-xs",
        dark ? "border-mesh-ink/30 text-mesh-ink-2" : "border-ink/25 text-ink-3"
      )}
    >
      {label}
    </span>
  )
}
