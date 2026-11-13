import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { type Cause, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import type { ReactNode } from "react"
import { frameAtom } from "../data/frame.ts"
import { sheetsAtom } from "../data/sheets.ts"
import { ConsoleSheetsSource } from "./sheets-source.tsx"

/*
 * What both Rekenbladen pages stand on (M14 step 4): the frame (who is reading, and the team to share with) and the
 * reader's sheets. Until they are in, the page's own skeleton; a role without Data · Bekijken is told so; a read that
 * failed says so and offers to try again.
 */

type SkeletonKind = Parameters<typeof PageSkeleton>[0]["kind"]

const isForbidden = Schema.is(Forbidden)

/** The refusal in a failed read, if that is what it was. */
export const refusalOf = (cause: Cause.Cause<unknown>) => {
  const reason = cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
  return reason !== undefined && reason._tag === "Fail" && isForbidden(reason.error) ? reason.error : undefined
}

export function SheetsDenied({ refused, action }: { refused: Forbidden; action: string }) {
  return (
    <DeniedPanel
      title="Je rol kan Rekenbladen niet zien"
      denial={{
        perm: refused.permission as Permission,
        arg: refused.level as Level,
        roleLabel: refused.roleLabel,
        grantingRoles: [],
        granters: [],
        request: { state: "none" },
        action
      }}
    />
  )
}

export function SheetsFailed({ title, retry }: { title: string; retry: () => void }) {
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader title={title} crumbs={title === "Rekenbladen" ? [] : [{ label: "Rekenbladen", to: "/sheets" }]} />
      <div role="alert" className="flex flex-col items-start gap-3 px-5">
        <p className="text-base text-ink-2">
          {title === "Rekenbladen"
            ? "Rekenbladen konden niet worden geladen."
            : "Dit rekenblad kon niet worden geladen."}
        </p>
        <button
          type="button"
          onClick={retry}
          className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
        >
          Opnieuw proberen
        </button>
      </div>
    </div>
  )
}

export const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  AsyncResult.isSuccess(result) ? result.value : Option.getOrUndefined(AsyncResult.value(result))

export function SheetsGate({ kind, title, children }: { kind: SkeletonKind; title: string; children: ReactNode }) {
  const frame = valueOf(useAtomValue(frameAtom))
  const result = useAtomValue(sheetsAtom)
  const refresh = useAtomRefresh(sheetsAtom)
  const list = valueOf(result)
  if (frame !== undefined && list !== undefined) {
    return <ConsoleSheetsSource frame={frame} list={list}>{children}</ConsoleSheetsSource>
  }
  if (AsyncResult.isFailure(result) && !result.waiting) {
    const refused = refusalOf(result.cause)
    return refused === undefined
      ? <SheetsFailed title={title} retry={refresh} />
      : <SheetsDenied refused={refused} action="Sheets.list" />
  }
  return <PageSkeleton kind={kind} title={title} />
}
