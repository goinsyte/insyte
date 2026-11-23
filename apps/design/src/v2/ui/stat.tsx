import { Tooltip } from "./tooltip.tsx"

/**
 * One figure with its unit and what it counts, for a `<dl>`: the value as a figure (.figure), the label under it.
 * With `explain`, the label is dotted-underlined and focusable, and the tooltip says how the figure is
 * worked out (an agent's "hours saved" is an estimate, so it says what it is based on). The sentence
 * is also read out with the label, so it is never only on hover.
 */
export function Stat({ value, unit, label, explain }: {
  readonly value: string
  readonly unit: string
  readonly label: string
  readonly explain?: string
}) {
  return (
    <div className="flex flex-col-reverse gap-0.5">
      <dt className="text-xs text-ink-3">
        {explain === undefined ? label : (
          <Tooltip content={explain} placement="bottom">
            <button
              type="button"
              className="cursor-help rounded-xs underline decoration-ink-4 decoration-dotted underline-offset-2 hover:text-ink-2"
            >
              {label}
              <span className="sr-only">: {explain}</span>
            </button>
          </Tooltip>
        )}
      </dt>
      <dd className="figure text-md text-ink">
        {value}
        {unit !== "" && <span className="ml-1 font-sans text-xs text-ink-3">{unit}</span>}
      </dd>
    </div>
  )
}
