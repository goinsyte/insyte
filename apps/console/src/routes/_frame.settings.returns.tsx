import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import { ReadOnlyNotice } from "@insyte/ui/app/access/read-only-notice"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { ReturnSettingsPage } from "@insyte/ui/app/returns/settings-screen"
import { ReturnSettingsSourceProvider } from "@insyte/ui/app/returns/source"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { RotateCcw } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { productsAtom } from "../data/products.ts"
import { returnSettingsAtom } from "../data/returns.ts"
import { useConsoleReturnSettingsSource } from "../returns/returns-source.tsx"

/**
 * Instellingen → Retouren (step 11.2, M9.1): the reference's returns policy over `Returns.settings`, in the settings
 * sheet, with the products a rule can name. The loader reads both on the server. Changing it takes Retouren · Beheren;
 * with less the page reads under the Alleen lezen line, its fields disabled, as the reference's settings layout does.
 */
export const Route = createFileRoute("/_frame/settings/returns")({
  head: () => ({ meta: [{ title: "Retouren · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(returnSettingsAtom)
    context.registry.mount(productsAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, returnSettingsAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, productsAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: ReturnSettingsRoute
})

function Pending() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <PageSkeleton kind="settings" title="Retouren" />
    </div>
  )
}

const isForbidden = Schema.is(Forbidden)

function ReturnSettingsRoute() {
  const result = useAtomValue(returnSettingsAtom)
  const saved = Option.getOrUndefined(AsyncResult.value(result))
  if (saved !== undefined) return <Loaded saved={saved} />
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <div className="flex min-h-full flex-col bg-paper text-ink">
        <SettingsSheet title="Retouren" icon={RotateCcw}>
          <DeniedPanel
            title="Je rol kan de retourinstellingen niet zien"
            denial={{
              perm: refused.error.permission as Permission,
              arg: refused.error.level as Level,
              roleLabel: refused.error.roleLabel,
              grantingRoles: [],
              granters: [],
              request: { state: "none" },
              action: "Returns.settings"
            }}
          />
        </SettingsSheet>
      </div>
    )
  }
  return <Pending />
}

function Loaded({ saved }: { saved: ReturnSettingsDoc }) {
  const source = useConsoleReturnSettingsSource(saved)
  const readOnly = source.gate.ok ? null : source.gate.reason
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <ReturnSettingsSourceProvider value={source}>
        <SettingsSheet title="Retouren" icon={RotateCcw}>
          {readOnly === null ? <ReturnSettingsPage /> : (
            <>
              <ReadOnlyNotice reason={readOnly} />
              <fieldset disabled className="contents">
                <ReturnSettingsPage />
              </fieldset>
            </>
          )}
        </SettingsSheet>
      </ReturnSettingsSourceProvider>
    </div>
  )
}
