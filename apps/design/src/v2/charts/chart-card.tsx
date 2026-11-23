import { useState } from "react"
import { Link } from "../router.tsx"
import { BarChart3, Check } from "../ui/icons.tsx"
import { BarChart } from "./bar-chart.tsx"
import { Key } from "./parts.tsx"
import { RankChart } from "./rank-chart.tsx"
import type { BarData } from "./types.ts"

/**
 * A chart inside a conversation: the same marks as on a board (ink, comparison grey, one accent), on
 * a well (a tonal ground, no frame) so it reads as a figure in the text, with its title and key under it. "Op een bord zetten"
 * moves it to a board as a block, which is why it has to be the same chart and not a lookalike.
 */
export function ChartCard({ title, kind, data, board }: {
  readonly title: string
  readonly kind: "bar" | "rank"
  readonly data: BarData
  /** Where "Op een bord zetten" puts it. */
  readonly board: { readonly label: string; readonly href: string }
}) {
  const [pinned, setPinned] = useState(false)
  return (
    <figure className="my-1 max-w-md rounded-lg bg-well">
      <div className="px-4 pt-3 pb-1">
        {kind === "bar"
          ? <BarChart data={data} height={150} axisLabels={false} />
          : (
            <div className="py-2">
              <RankChart data={data} />
            </div>
          )}
      </div>
      <figcaption className="flex flex-col gap-2 px-4 pt-1 pb-3">
        <span className="text-sm font-medium text-ink">{title}</span>
        <span className="flex flex-wrap items-center justify-between gap-2">
          <Key compare mark={kind} focus={data.focus !== undefined} />
          {pinned
            ? (
              <Link
                to={board.href}
                className="flex items-center gap-1 text-xs font-medium text-good-ink hover:underline"
              >
                <Check size={13} />
                Op bord {board.label}
              </Link>
            )
            : (
              <button
                type="button"
                onClick={() => setPinned(true)}
                className="flex items-center gap-1 rounded-xs text-xs font-medium text-ink-2 hover:text-ink"
              >
                <BarChart3 size={13} />
                Op een bord zetten
              </button>
            )}
        </span>
      </figcaption>
    </figure>
  )
}
