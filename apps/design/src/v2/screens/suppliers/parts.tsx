import type { ComponentProps } from "react"
import { TableSkeleton as SharedTableSkeleton } from "../../ui/data.tsx"

/* The shared record states (`ui/data.tsx`) and side column (`ui/page.tsx`), as this area uses them. */

export { Figures, LoadError as PageError, RecordSkeleton } from "../../ui/data.tsx"
export { Side } from "../../ui/page.tsx"

/** The area's tables open with a person or a product: a round mark before the name. */
export function TableSkeleton(props: ComponentProps<typeof SharedTableSkeleton>) {
  return <SharedTableSkeleton avatar {...props} />
}
