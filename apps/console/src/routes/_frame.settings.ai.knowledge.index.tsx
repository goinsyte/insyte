import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { ArticleList, GapList } from "@insyte/modules/knowledge/domain/Knowledge"
import { KnowledgePage } from "@insyte/ui/app/ai/knowledge-screen"
import { KnowledgeSourceProvider } from "@insyte/ui/app/ai/knowledge-source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { BookOpen } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useConsoleKnowledgeSource } from "../ai/knowledge-source.ts"
import { knowledgeGapsAtom, knowledgeListAtom } from "../data/knowledge.ts"

/**
 * Instellingen → Insyte AI → Kennisbank (M15 step 7): the reference's list over `Knowledge.list` and the open
 * questions, in the settings sheet. Read with Instellingen · Bekijken, written with Beheren; the loader reads both on
 * the server. A read that failed says so and offers to try again.
 */
export const Route = createFileRoute("/_frame/settings/ai/knowledge/")({
  head: () => ({ meta: [{ title: "Kennisbank · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(knowledgeListAtom)
    context.registry.mount(knowledgeGapsAtom)
    await Promise.all([
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, knowledgeListAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, knowledgeGapsAtom)))
    ])
  },
  pendingComponent: Pending,
  component: KnowledgeRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Kennisbank" />
    </div>
  )
}

function KnowledgeRoute() {
  const list = useAtomValue(knowledgeListAtom)
  const gaps = useAtomValue(knowledgeGapsAtom)
  const refreshList = useAtomRefresh(knowledgeListAtom)
  const refreshGaps = useAtomRefresh(knowledgeGapsAtom)
  const rows = Option.getOrUndefined(AsyncResult.value(list))
  const open = Option.getOrUndefined(AsyncResult.value(gaps))
  if (rows !== undefined && open !== undefined) return <Loaded list={rows} gaps={open} />
  if ((AsyncResult.isFailure(list) && !list.waiting) || (AsyncResult.isFailure(gaps) && !gaps.waiting)) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Kennisbank" icon={BookOpen}>
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-base text-ink-2">De kennisbank kon niet worden geladen.</p>
            <button
              type="button"
              onClick={() => {
                refreshList()
                refreshGaps()
              }}
              className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
            >
              Opnieuw proberen
            </button>
          </div>
        </SettingsSheet>
      </div>
    )
  }
  return <Pending />
}

function Loaded({ list, gaps }: { list: ArticleList; gaps: GapList }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <KnowledgeSourceProvider value={useConsoleKnowledgeSource(list, gaps.rows)}>
        <SettingsSheet title="Kennisbank" icon={BookOpen}>
          <KnowledgePage />
        </SettingsSheet>
      </KnowledgeSourceProvider>
    </div>
  )
}
