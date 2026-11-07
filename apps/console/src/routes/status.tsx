import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { healthAtom } from "../data/system.ts"

/**
 * The walking skeleton's page (15, step 0): the console renders on the server, asks the API over the service binding
 * through an atom, and the API asks Postgres. The answer is in the first HTML; the browser hydrates it.
 */
export const Route = createFileRoute("/status")({
  head: () => ({ meta: [{ title: "Status · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(healthAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, healthAtom)))
  },
  component: StatusPage
})

function StatusPage() {
  const health = useAtomValue(healthAtom)
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-ink">
      <h1 className="text-2xl font-semibold">Status</h1>
      {AsyncResult.match(health, {
        onInitial: () => <p className="mt-6 text-ink-3">Even kijken…</p>,
        onFailure: () => <p className="mt-6 text-ink-2">De API antwoordt niet.</p>,
        onSuccess: ({ value }) => (
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-ink-3">Omgeving</dt>
            <dd>{value.environment}</dd>
            <dt className="text-ink-3">Versie</dt>
            <dd className="tabular-nums">{value.version}</dd>
            <dt className="text-ink-3">Database</dt>
            <dd data-testid="database">
              <span
                className={value.database === "ok"
                  ? "rounded bg-signal-green-bg px-2"
                  : "rounded bg-signal-red-bg px-2"}
              >
                {value.database === "ok" ? "ok" : "niet bereikbaar"}
              </span>
            </dd>
            <dt className="text-ink-3">Migratie</dt>
            <dd className="tabular-nums">{value.migratedTo}</dd>
          </dl>
        )
      })}
    </main>
  )
}
