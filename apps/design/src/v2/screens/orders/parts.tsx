import type { ComponentProps } from "react"
import { LoadError as SharedLoadError, TableSkeleton as SharedTableSkeleton } from "../../ui/data.tsx"

/*
 * Bestellingen's own takes on the shared states: its lists keep the search and filter row above the
 * table while they load, and its errors name the shop that did not answer.
 */

export { refundLimit } from "../../ui/access.tsx"
export { copyAndSay as copyText, exportCsv, toggleQuery, undoable, useQueryList } from "../../ui/acts.ts"
export { RecordSkeleton } from "../../ui/data.tsx"
export { Fact } from "../../ui/key-value.tsx"

export function TableSkeleton(props: ComponentProps<typeof SharedTableSkeleton>) {
  return <SharedTableSkeleton toolbar {...props} />
}

export function LoadError(props: Omit<ComponentProps<typeof SharedLoadError>, "children">) {
  return (
    <SharedLoadError {...props}>
      Shopify gaf geen antwoord binnen tien seconden. Er is niets verloren gegaan.
    </SharedLoadError>
  )
}
