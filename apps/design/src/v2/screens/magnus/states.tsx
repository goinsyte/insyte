import { Button } from "../../ui/button.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { ErrorState } from "../../ui/states.tsx"
import { setView } from "../../view.ts"

/*
 * The loading and error shapes Magnus's pages share: a column of proposal- or row-shaped skeletons,
 * and the error that names what failed with "Opnieuw proberen" (which, in the demo, loads it).
 */

/** Rows still coming: a disc, a title and a line under it, `rows` times. */
export function LoadingRows({ rows = 4, label, tall = false }: {
  readonly rows?: number
  readonly label: string
  /** Proposal-height rows (a title, a paragraph, the buttons) instead of list rows. */
  readonly tall?: boolean
}) {
  return (
    <div aria-busy="true" aria-label={label} className={tall ? "flex flex-col gap-8" : "flex flex-col gap-1"}>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="flex items-start gap-3 py-2.5">
          <Skeleton className="size-7 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5" />
            <Skeleton className="h-2.5 w-4/5" />
            {tall && (
              <>
                <Skeleton className="h-2.5 w-2/3" />
                <span className="flex gap-2 pt-2">
                  <Skeleton className="h-8 w-24 rounded-sm" />
                  <Skeleton className="h-8 w-20 rounded-sm" />
                </span>
              </>
            )}
          </span>
        </span>
      ))}
    </div>
  )
}

export function LoadError({ what, detail }: { readonly what: string; readonly detail: string }) {
  return (
    <ErrorState
      title={`${what} laden lukte niet`}
      detail={detail}
      action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
    >
      De verbinding met de server viel weg. Er is niets veranderd; probeer het zo opnieuw.
    </ErrorState>
  )
}
