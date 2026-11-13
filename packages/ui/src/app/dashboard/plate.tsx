import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { Plate } from "../../data-source"
import { cn } from "../lib/utils"

/** Where a plate is in its life: drawn and waiting, or decided and settling. */
export type PlatePhase = "drawn" | "filed" | "discarded"

/**
 * The plate: a proposal drawn as a blueprint before it becomes a record.
 *
 * `abyss` ground, `mesh-ink` line work, a 32px drafting grid, and a drawing in which every line
 * measures something — a dimension across the top carrying the time left, the record as it stands, a
 * leader down to the record as drawn, and a witness line out to the store it belongs to. Nothing is
 * decoration; a mark that measures nothing is not in the drawing.
 *
 * The identity of the drawing — its number, its state, the confidence — sits in the TITLE BLOCK at
 * the foot, where a technical drawing puts it, and not in a bar above the heading, which is a kicker
 * by another name.
 *
 * The drawing FLOWS. The first build set every element at an absolute offset, the way the sketch
 * did, and the sketch could do that because its copy was fixed: one real value wrapping to a second
 * line pushed the "as drawn" block through the witness line beneath it. A drafted layout has to
 * survive its own content, so the rows stack and the lines are drawn between them.
 */
export function PlateView({
  plate,
  drawing,
  phase,
  onFile,
  onRedraw,
  onDiscard
}: {
  plate: Plate
  /** How many times it has been redrawn. A new drawing is a new stroke, so the key changes. */
  drawing: number
  phase: PlatePhase
  onFile: () => void
  onRedraw: () => void
  onDiscard: () => void
}) {
  const still = useReducedMotion()
  const decided = phase !== "drawn"
  const stamp = plate.filed ?? "Uitgevoerd"
  const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date())

  return (
    <aside
      key={plate.number}
      className="plate unroll relative flex w-full shrink-0 flex-col overflow-hidden lg:w-[436px]"
      aria-label={`Voorstel ${plate.number}`}
    >
      <div
        className={cn("plate-scan", decided && "hidden")}
        style={{ "--plate-scan-travel": "840px" } as React.CSSProperties}
        aria-hidden
      />

      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pt-7">
        <h2 className="text-2xl text-mesh-ink leading-[31px] tracking-[-0.025em]">
          {plate.heading}
        </h2>
        <p className="mt-3 text-base text-mesh-ink-2 leading-[19px]">{plate.body}</p>

        {
          /*
           * The drawing. `draw` masks it from the top down in one 420ms stroke so the line appears
           * ruled rather than faded up — the signature moment, and it is on the drawing alone.
           *
           * Deciding changes it. Filing SLACKENS the line — it dims to chalk, the way an executed
           * drawing goes into the drawer — and a discard ERASES it, the mask running back the way
           * it came. Both end on the board for a beat, so the decision is seen to have been made.
           */
        }
        <div
          key={drawing}
          className={cn(
            "draw mt-6 pb-6 transition-[opacity,clip-path] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            phase === "filed" && "opacity-45",
            phase === "discarded" && !still && "[clip-path:inset(0_0_0_100%)]",
            phase === "discarded" && still && "opacity-0"
          )}
          style={{ clipPath: phase === "discarded" ? undefined : "inset(0 0 0 0)" }}
        >
          <div className="text-right text-base text-mesh-ink tabular-nums">
            {plate.dimension}
          </div>
          <div className="relative mt-1 h-[9px]" aria-hidden>
            <div className="absolute top-1/2 right-0 left-0 h-px bg-mesh-ink/50" />
            <div className="absolute top-0 left-0 h-[9px] w-px bg-mesh-ink/70" />
            <div className="absolute top-0 right-0 h-[9px] w-px bg-mesh-ink/70" />
          </div>

          <Block label={plate.before.label} value={plate.before.value} className="mt-5" />

          <div className="flex items-center gap-3 py-1 pl-[38px]">
            <div className="h-10 w-px shrink-0 bg-mesh-ink/55" aria-hidden />
            <span className="text-base text-mesh-ink-3">{plate.change}</span>
          </div>

          <Block
            label={plate.after.label}
            value={plate.after.value}
            className="bg-arc/35 outline-mesh-ink"
          />

          <div className="mt-2 flex items-center justify-end gap-2.5">
            <div className="h-px w-10 shrink-0 bg-mesh-ink/50" aria-hidden />
            <span className="text-base text-mesh-ink">{plate.witness}</span>
          </div>
        </div>

        {
          /*
           * The stamp. A filed drawing is stamped, the way a drawing office marks the one that went
           * out — chalk outline, set a few degrees off square, landing with weight rather than
           * fading in, because the decision is the heaviest thing that happens on this screen.
           */
        }
        <AnimatePresence>
          {phase === "filed" ?
            (
              <motion.div
                key="stamp"
                className="pointer-events-none absolute top-[46%] left-1/2 flex flex-col items-center rounded-md px-5 py-2.5 text-mesh-ink outline outline-2 outline-mesh-ink"
                initial={still
                  ? { opacity: 1, x: "-50%", rotate: -5 }
                  : { opacity: 0, scale: 1.35, x: "-50%", rotate: -9 }}
                animate={{ opacity: 1, scale: 1, x: "-50%", rotate: -5 }}
                transition={{ type: "spring", stiffness: 640, damping: 22, mass: 0.7 }}
                role="status"
              >
                <span className="font-medium text-xl leading-none">{stamp}</span>
                <span className="mt-1 text-xs text-mesh-ink-2 tabular-nums">
                  {plate.number} · {time}
                </span>
              </motion.div>
            ) :
            phase === "discarded" ?
            (
              <motion.p
                key="erased"
                className="absolute right-6 bottom-6 left-6 text-base text-mesh-ink-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                role="status"
              >
                Genegeerd. Er is niets aan het record veranderd.
              </motion.p>
            ) :
            null}
        </AnimatePresence>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 px-6 pb-5">
        <PlateButton primary onClick={onFile} disabled={decided} shortcut="E">
          {plate.fileLabel}
        </PlateButton>
        <PlateButton onClick={onRedraw} disabled={decided} shortcut="R">
          Opnieuw tekenen
        </PlateButton>
        <PlateButton onClick={onDiscard} disabled={decided} shortcut="D">
          Negeren
        </PlateButton>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 bg-mesh-ink/8 px-6 py-3 text-base text-mesh-ink-3">
        <span>
          Voorstel <span className="text-mesh-ink tabular-nums">{plate.number}</span> ·{" "}
          {phase === "filed" ? stamp.toLowerCase() : phase === "discarded" ? "genegeerd" : plate.state} ·{" "}
          <span className="tabular-nums">{plate.confidence}</span>
        </span>
        <span className="hidden shrink-0 text-xs xl:inline">J K om te bladeren</span>
      </div>
    </aside>
  )
}

function PlateButton({
  primary = false,
  shortcut,
  children,
  ...props
}: React.ComponentProps<"button"> & { primary?: boolean; shortcut: string }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      aria-keyshortcuts={shortcut}
      className={cn(
        "group flex h-[38px] items-center gap-2 rounded-lg px-4 font-medium text-base transition-colors disabled:pointer-events-none disabled:opacity-40",
        primary
          ? "bg-mesh-ink text-abyss hover:bg-paper"
          : "bg-mesh-ink/15 text-mesh-ink hover:bg-mesh-ink/25"
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {children}
      <kbd
        className={cn(
          "rounded-sm px-1 font-sans text-2xs tabular-nums leading-4",
          primary ? "bg-abyss/10 text-abyss/70" : "bg-mesh-ink/12 text-mesh-ink-2"
        )}
      >
        {shortcut}
      </kbd>
    </motion.button>
  )
}

/**
 * One state of the record, enclosed in chalk because the drawing encloses it. The outline is the one
 * line in this system that is not a hairline — it is the edge of a drawn object, not a data boundary.
 */
function Block({
  label,
  value,
  className
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div
      className={`bg-abyss/60 px-3.5 py-3 outline outline-1 outline-mesh-ink/50 ${className ?? ""}`}
    >
      <div className="text-base text-mesh-ink-3">{label}</div>
      <div className="mt-1 text-md text-mesh-ink leading-snug tabular-nums">{value}</div>
    </div>
  )
}

/** No plate drawn for the selected row. The drafting grid, ruled and not yet drawn on. */
export function PlateEmpty({ onDismiss, settling }: { onDismiss: () => void; settling: boolean }) {
  return (
    <aside
      className="plate flex w-full shrink-0 flex-col justify-end lg:w-[436px]"
      aria-label="Geen voorstel getekend"
    >
      <div className="px-6 pb-6">
        <p className="text-md text-mesh-ink">{settling ? "Opzijgezet." : "Hiervoor is niets getekend."}</p>
        <button
          type="button"
          onClick={onDismiss}
          disabled={settling}
          aria-keyshortcuts="D"
          className="mt-4 flex h-[34px] items-center rounded-lg bg-mesh-ink/15 px-3.5 font-medium text-base text-mesh-ink transition-colors hover:bg-mesh-ink/25 disabled:opacity-40"
        >
          Markeren als gezien
        </button>
      </div>
      <div className="shrink-0 bg-mesh-ink/8 px-6 py-3 text-base text-mesh-ink-3">
        Geen voorstel · niets uit te voeren
      </div>
    </aside>
  )
}
