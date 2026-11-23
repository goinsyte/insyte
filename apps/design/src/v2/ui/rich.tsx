import { Fragment } from "react"

/**
 * A sentence with **bold** spans, as the fixtures write the assistant's answers. Bold carries the
 * figure or the record the sentence is about; figures inside bold are set as figures.
 */
export function Rich({ text }: { readonly text: string }) {
  const parts = text.split("**")
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? (
            <strong key={i} className={/\d/.test(part) ? "figure font-medium text-ink" : "font-semibold text-ink"}>
              {part}
            </strong>
          )
          : <Fragment key={i}>{part}</Fragment>
      )}
    </>
  )
}
