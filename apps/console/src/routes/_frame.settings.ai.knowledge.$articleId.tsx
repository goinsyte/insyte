import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { NotFound } from "@insyte/domain/Errors"
import type { Article, Gap } from "@insyte/modules/knowledge/domain/Knowledge"
import { ArticlePage, type ArticleSearch } from "@insyte/ui/app/ai/article-screen"
import { ArticleSourceProvider } from "@insyte/ui/app/ai/knowledge-source"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { BookOpen } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity"
import type { ReactNode } from "react"
import { useConsoleArticleSource } from "../ai/knowledge-source.ts"
import { knowledgeArticleAtom, knowledgeGapAtom } from "../data/knowledge.ts"

/**
 * One chapter of Kennisbank (M15 step 7): the reference's editor over `Knowledge.get`, with the question it is written
 * for (`?gap=`) where there is one. Opslaan als concept and Publiceren save from the revision it was read at; Versies
 * reads each version's text when it opens. An unknown or archived chapter says so, as in the reference.
 */
export const Route = createFileRoute("/_frame/settings/ai/knowledge/$articleId")({
  validateSearch: (
    s: Record<string, unknown>
  ): ArticleSearch => (typeof s["gap"] === "string" ? { gap: s["gap"] } : {}),
  head: () => ({ meta: [{ title: "Kennisbank · Insyte" }] }),
  loaderDeps: ({ search }) => ({ gap: search.gap }),
  loader: async ({ context, params, deps }) => {
    const article = knowledgeArticleAtom(params.articleId)
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(article)
    const reads = [Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, article)))]
    if (deps.gap !== undefined) {
      const gap = knowledgeGapAtom(deps.gap)
      context.registry.mount(gap)
      reads.push(Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, gap))))
    }
    await Promise.all(reads)
  },
  pendingComponent: Pending,
  component: ArticleRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Kennisbank" />
    </div>
  )
}

const NO_GAP = Atom.make(AsyncResult.initial<never, never>())
const isNotFound = Schema.is(NotFound)

function ArticleRoute() {
  const { articleId } = Route.useParams()
  const { gap: gapId } = Route.useSearch()
  const result = useAtomValue(knowledgeArticleAtom(articleId))
  const refresh = useAtomRefresh(knowledgeArticleAtom(articleId))
  const gapResult = useAtomValue(gapId === undefined ? NO_GAP : knowledgeGapAtom(gapId))
  const article = Option.getOrUndefined(AsyncResult.value(result))
  // A question that is gone or not the viewer's leaves the chapter as it is.
  const gapRead = gapId === undefined || !AsyncResult.isInitial(gapResult)
  const gap = Option.getOrUndefined(AsyncResult.value(gapResult)) as Gap | undefined
  if (article !== undefined && !article.archived && gapRead) {
    return <Loaded key={articleId} article={article} gap={gap} />
  }
  const failed = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  const gone = article?.archived === true ||
    (failed !== undefined && failed._tag === "Fail" && isNotFound(failed.error))
  if (gone) {
    return (
      <Sheet>
        <ArticlePage />
      </Sheet>
    )
  }
  if (AsyncResult.isFailure(result) && !result.waiting) {
    return (
      <Sheet>
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-base text-ink-2">Dit hoofdstuk kon niet worden geladen.</p>
          <button
            type="button"
            onClick={refresh}
            className="field flex h-9 w-fit items-center rounded-md px-3 font-medium text-base text-ink hover:field-hover"
          >
            Opnieuw proberen
          </button>
        </div>
      </Sheet>
    )
  }
  return <Pending />
}

function Sheet({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title="Kennisbank" icon={BookOpen}>
        {children}
      </SettingsSheet>
    </div>
  )
}

function Loaded({ article, gap }: { article: Article; gap: Gap | undefined }) {
  return (
    <ArticleSourceProvider value={useConsoleArticleSource(article, gap)}>
      <Sheet>
        <ArticlePage />
      </Sheet>
    </ArticleSourceProvider>
  )
}
