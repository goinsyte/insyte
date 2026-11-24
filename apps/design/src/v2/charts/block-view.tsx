import type { ReactNode } from "react"
import type { Block } from "../fixtures/analytics.ts"
import { cx } from "../ui/cx.ts"
import { BarChart } from "./bar-chart.tsx"
import { DataTable } from "./data-table.tsx"
import { Figures } from "./figures.tsx"
import { Funnel } from "./funnel.tsx"
import { LineChart } from "./line-chart.tsx"
import { Key, NoteLine } from "./parts.tsx"
import type { KeyLabels } from "./parts.tsx"
import { RankChart } from "./rank-chart.tsx"

/**
 * One block on a board, always in the same anatomy, whatever its form:
 *
 *   question          (the title is the question the block answers, sentence case)
 *   the chart         (one of the five forms, at the board's one chart height)
 *   Magnus's note     (when there is one, marked with the gradient)
 *   key · source      (what the marks mean, and where every figure came from)
 *
 * The anatomy is the consistency standard: a person can combine anything on a board and it still
 * reads as one surface, because no block can choose its own colours, type or layout.
 *
 * A block draws no frame: it sits on the page and space separates it from the next. `size` is the
 * only thing a placement changes: the board's lead block draws its chart taller and its question
 * larger, a block in Live's side column draws it shorter.
 */
export type BlockSize = "lead" | "normal" | "compact"

const CHART_HEIGHT: Record<BlockSize, number> = { lead: 280, normal: 200, compact: 140 }

export function BlockView(
  { block, compareLabel, keyLabels, actions, onAsk, onPick, compare = true, size = "normal", className }: {
    readonly block: Block
    readonly compareLabel: string
    readonly keyLabels?: KeyLabels
    readonly actions?: ReactNode
    readonly onAsk?: (text: string) => void
    /** A figure, point, bar or row opens what is behind it (by its index); funnels and tables do not. */
    readonly onPick?: (index: number) => void
    /** Off when the period is compared with nothing: no change, no period-before marks. */
    readonly compare?: boolean
    readonly size?: BlockSize
    readonly className?: string
  }
) {
  const ask = block.note === undefined || onAsk === undefined ? undefined : () => onAsk(block.title)
  const headingId = `blok-${block.id}`
  return (
    <article aria-labelledby={headingId} className={cx("flex h-full flex-col gap-4", className)}>
      <header className="flex min-h-7 flex-wrap items-start gap-x-3 gap-y-2">
        <h2
          id={headingId}
          className={cx(
            "min-w-[12rem] flex-1 font-semibold text-balance text-ink",
            size === "lead" ? "text-lg" : "text-sm"
          )}
        >
          {block.title}
        </h2>
        {actions}
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <Body
          block={block}
          compareLabel={compareLabel}
          compare={compare}
          height={CHART_HEIGHT[size]}
          {...(onPick === undefined ? {} : { onPick })}
        />
      </div>

      {block.note !== undefined && <NoteLine note={block.note} onAsk={ask} />}

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {hasKey(block) ?
          (
            <Key
              compare={compare && hasCompare(block)}
              labels={keyLabels}
              mark={block.kind === "line" ? "line" : block.kind === "rank" ? "rank" : "bar"}
              focus={hasFocus(block)}
            />
          ) :
          <span />}
        <p className="text-2xs text-ink-3">{block.source}</p>
      </footer>
    </article>
  )
}

function Body({ block, compareLabel, compare, height, onPick }: {
  readonly block: Block
  readonly compareLabel: string
  readonly compare: boolean
  readonly height: number
  readonly onPick?: (index: number) => void
}) {
  const pick = onPick === undefined ? {} : { onPick }
  switch (block.kind) {
    case "figures":
      return <Figures figures={block.figures} compareLabel={compareLabel} compare={compare} {...pick} />
    case "line":
      return <LineChart data={block.data} note={block.note} height={height} {...pick} />
    case "bar":
      return <BarChart data={block.data} note={block.note} height={height} {...pick} />
    case "rank":
      return <RankChart data={block.data} note={block.note} {...pick} />
    case "funnel":
      return <Funnel data={block.data} />
    case "table":
      return <DataTable data={block.data} />
  }
}

/** Whether a bar or rank block draws one item in the accent. */
const hasFocus = (block: Block) =>
  (block.kind === "bar" || block.kind === "rank") && (block.data.focus ?? block.note?.at) !== undefined

const hasKey = (block: Block) => block.kind === "line" || block.kind === "bar" || block.kind === "rank"

const hasCompare = (block: Block) =>
  (block.kind === "line" && block.data.compare !== undefined) ||
  ((block.kind === "bar" || block.kind === "rank") && block.data.items.some((item) => item.compare !== undefined))
