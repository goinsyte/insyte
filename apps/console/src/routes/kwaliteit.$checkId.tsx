import { useAtomValue } from "@effect/atom-react"
import type { SupplierCheck } from "@insyte/modules/quality/domain/Quality"
import { QualityLinkScreen } from "@insyte/ui/app/quality/link-screen"
import { QualityLinkSourceProvider } from "@insyte/ui/app/quality/link-source"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { linkedCheckAtom } from "../data/quality.ts"
import { useConsoleQualityLink } from "../quality/link-source.ts"

/**
 * A quality check answered by its supplier through its link, `/kwaliteit/<id>?k=<token>` (step 11.6, M9.4): the
 * reference's page over `QualityLink.*`, without an account. The check is read on the server, so the first paint is
 * the check, or "Deze link werkt niet meer".
 */
export const Route = createFileRoute("/kwaliteit/$checkId")({
  validateSearch: (search: Record<string, unknown>): { k: string } => ({
    k: typeof search["k"] === "string" && search["k"].length <= 1024 ? search["k"] : ""
  }),
  loaderDeps: ({ search }) => ({ k: search.k }),
  loader: async ({ context, deps }) => {
    if (deps.k === "") return
    const atom = linkedCheckAtom(deps.k)
    context.registry.mount(atom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, atom)))
  },
  head: () => ({ meta: [{ title: "Kwaliteitscontrole" }] }),
  component: LinkRoute
})

function LinkRoute() {
  const { k } = Route.useSearch()
  return k === "" ? <Loaded id="" token="" check={null} /> : <Read token={k} />
}

function Read({ token }: { token: string }) {
  const { checkId } = Route.useParams()
  const result = useAtomValue(linkedCheckAtom(token))
  if (AsyncResult.isInitial(result)) return null
  const check = AsyncResult.isSuccess(result) ? result.value : Option.getOrNull(AsyncResult.value(result))
  return <Loaded id={checkId} token={token} check={check} />
}

function Loaded({ id, token, check }: { id: string; token: string; check: SupplierCheck | null }) {
  return (
    <QualityLinkSourceProvider value={useConsoleQualityLink(id, token, check)}>
      <QualityLinkScreen />
    </QualityLinkSourceProvider>
  )
}
