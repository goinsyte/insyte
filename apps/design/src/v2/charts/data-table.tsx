import { cx } from "../ui/cx.ts"
import { formatChange, formatValue, judge } from "./format.ts"
import type { TableData } from "./types.ts"

const SIGNAL = { good: "text-good-ink", bad: "text-bad-ink", flat: "text-ink-3" } as const

/**
 * A table: words left, figures right in tabular numerals, hairlines between rows because rows are data. A `bar`
 * column draws its share under the figure; a column with a `previousKey` carries its change, signed
 * and judged. The `focus` row sits on the accent tint.
 */
export function DataTable({ data }: { readonly data: TableData }) {
  const maxOf = (key: string) => Math.max(...data.rows.map((row) => Number(row[key] ?? 0)))
  return (
    <div className="pane-scroll -mx-1 px-1">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line">
            {data.columns.map((column, c) => (
              <th
                key={column.key}
                scope="col"
                className={cx("h-8 font-medium text-ink-3", c === 0 ? "text-left" : "text-right", c > 0 && "pl-4")}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr
              key={String(row[data.columns[0]?.key ?? ""])}
              className={cx("border-b border-line last:border-0", r === data.focus && "bg-accent-tint")}
            >
              {data.columns.map((column, c) => {
                const raw = row[column.key]
                if (column.format === undefined || typeof raw !== "number") {
                  return (
                    <th
                      key={column.key}
                      scope="row"
                      className={cx(
                        "h-9 w-full max-w-0 truncate pr-2 text-left font-normal",
                        r === data.focus ? "font-medium text-ink" : "text-ink"
                      )}
                    >
                      {raw}
                    </th>
                  )
                }
                const previous = column.previousKey === undefined ? undefined : row[column.previousKey]
                return (
                  <td
                    key={column.key}
                    className={cx("figure h-9 pl-4 text-right whitespace-nowrap text-ink", c === 0 && "text-left")}
                  >
                    <span className="inline-flex items-center justify-end gap-2">
                      {column.bar === true && (
                        <span
                          className="relative hidden h-1.5 w-12 rounded-full bg-well sm:inline-block"
                          aria-hidden="true"
                        >
                          <span
                            className={cx(
                              "absolute inset-y-0 left-0 rounded-full",
                              r === data.focus ? "bg-accent" : "bg-series-3"
                            )}
                            style={{ width: `${(raw / (maxOf(column.key) || 1)) * 100}%` }}
                          />
                        </span>
                      )}
                      {formatValue(raw, column.format)}
                      {typeof previous === "number" && (
                        <span className={cx("w-14 text-2xs", SIGNAL[judge(raw, previous, column.better ?? "higher")])}>
                          {formatChange(raw, previous, column.format)}
                        </span>
                      )}
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
