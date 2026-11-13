import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { SheetNotFound } from "@insyte/modules/sheets/domain/Sheets"
import { EmptyState } from "@insyte/ui/app/common/empty-state"
import { PageHeader } from "@insyte/ui/app/common/page-header"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SheetEditorPage } from "@insyte/ui/app/sheets/sheet-editor"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { sheetAtom, sheetsAtom } from "../data/sheets.ts"
import { refusalOf, SheetsDenied, SheetsFailed, SheetsGate, valueOf } from "../sheets/sheets-gate.tsx"
import { ConsoleSheetDoc } from "../sheets/sheets-source.tsx"

/**
 * One rekenblad (step 16.4, M14 step 4): the reference's editor over `Sheets.get`. The loader reads the sheet and the
 * list on the server; the grid stands in until they are in, and the cells show their bones until the figures they read
 * are in. A sheet that is not there, or not one the reader may open, says so the same way.
 */
export const Route = createFileRoute("/_frame/sheets/$sheetId")({
  head: () => ({ meta: [{ title: "Rekenblad · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = sheetAtom(params.sheetId)
    context.registry.mount(atom)
    context.registry.mount(sheetsAtom)
    await Effect.runPromise(
      Effect.ignore(
        Effect.all([
          AtomRegistry.getResult(context.registry, atom),
          AtomRegistry.getResult(context.registry, sheetsAtom)
        ])
      )
    )
  },
  component: SheetRoute
})

const isMissing = Schema.is(SheetNotFound)

function Missing() {
  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader title="Rekenblad" crumbs={[{ label: "Rekenbladen", to: "/sheets" }]} />
      <EmptyState kind="sheets" title="Dit rekenblad bestaat niet (meer)." body="Ga terug naar Rekenbladen." />
    </div>
  )
}

function SheetRoute() {
  const { sheetId } = Route.useParams()
  return (
    <SheetsGate kind="grid" title="Rekenblad">
      <Opened key={sheetId} id={sheetId} />
    </SheetsGate>
  )
}

function Opened({ id }: { id: string }) {
  const result = useAtomValue(sheetAtom(id))
  const refresh = useAtomRefresh(sheetAtom(id))
  const detail = valueOf(result)
  if (detail !== undefined) {
    return (
      <ConsoleSheetDoc detail={detail}>
        <SheetEditorPage />
      </ConsoleSheetDoc>
    )
  }
  if (AsyncResult.isFailure(result) && !result.waiting) {
    if (result.cause.reasons.some((r) => r._tag === "Fail" && isMissing(r.error))) return <Missing />
    const refused = refusalOf(result.cause)
    return refused === undefined
      ? <SheetsFailed title="Rekenblad" retry={refresh} />
      : <SheetsDenied refused={refused} action="Sheets.get" />
  }
  return <PageSkeleton kind="grid" title="Rekenblad" />
}
