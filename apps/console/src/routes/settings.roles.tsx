import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { RolesSourceProvider } from "@insyte/ui/app/roles/source"
import { RolesView } from "@insyte/ui/app/settings/roles-screen"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { UserCog } from "@insyte/ui/icons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option, Schema } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { myAccessAtom } from "../data/access.ts"
import { accessListAtom, rolesAtom } from "../data/roles.ts"
import { sessionMeAtom } from "../data/session.ts"
import { LiveUpdates } from "../realtime/live-updates.tsx"
import { useConsoleRolesSource } from "../team/roles-source.ts"

/**
 * Instellingen → Rollen (step 5.3, M3.2): the reference's roles page over `Roles.list` and `Access.list`, in the
 * settings sheet, without the shell (M5). The loader reads both on the server; until they are in, the reference's
 * settings skeleton stands in.
 */
export const Route = createFileRoute("/settings/roles")({
  validateSearch: (s: Record<string, unknown>): { role?: string; verzoek?: string; nieuw?: "1" } => ({
    ...(typeof s["role"] === "string" ? { role: s["role"] } : {}),
    ...(typeof s["verzoek"] === "string" ? { verzoek: s["verzoek"] } : {}),
    ...(s["nieuw"] === "1" || s["nieuw"] === 1 ? { nieuw: "1" as const } : {})
  }),
  beforeLoad: async ({ context }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: "/settings/roles" } })
    if (me.value.landing !== "/dashboard") throw redirect({ href: me.value.landing })
  },
  head: () => ({ meta: [{ title: "Rollen · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(rolesAtom)
    context.registry.mount(accessListAtom)
    context.registry.mount(myAccessAtom)
    await Effect.runPromise(
      Effect.all([
        Effect.ignore(AtomRegistry.getResult(context.registry, rolesAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, accessListAtom)),
        Effect.ignore(AtomRegistry.getResult(context.registry, myAccessAtom))
      ], { concurrency: "unbounded" })
    )
  },
  pendingComponent: Pending,
  component: RolesRoute
})

const isForbidden = Schema.is(Forbidden)

function Pending() {
  return (
    <main className="min-h-svh bg-paper text-ink">
      <PageSkeleton kind="settings" title="Rollen" />
    </main>
  )
}

function RolesRoute() {
  const result = useAtomValue(rolesAtom)
  const roles = AsyncResult.isSuccess(result) ? result.value : Option.getOrUndefined(AsyncResult.value(result))
  if (roles !== undefined) return <Loaded roles={roles} />
  const refused = AsyncResult.isFailure(result) ? result.cause.reasons.find((r) => r._tag === "Fail") : undefined
  if (refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    const f = refused.error
    return (
      <main className="min-h-svh bg-paper text-ink">
        <SettingsSheet title="Rollen" icon={UserCog}>
          <DeniedPanel
            title="Je rol kan de rollen niet zien"
            denial={{
              perm: f.permission as Permission,
              arg: f.level as Level,
              roleLabel: f.roleLabel,
              grantingRoles: [],
              granters: [],
              request: { state: "none" },
              action: "Roles.list"
            }}
          />
        </SettingsSheet>
      </main>
    )
  }
  return <Pending />
}

function Loaded({ roles }: { roles: Roles }) {
  const { role, verzoek } = Route.useSearch()
  const source = useConsoleRolesSource(roles)
  return (
    <main className="min-h-svh bg-paper text-ink">
      <LiveUpdates />
      <RolesSourceProvider value={source}>
        <SettingsSheet title="Rollen" icon={UserCog}>
          <RolesView roleId={role} verzoek={verzoek} />
        </SettingsSheet>
      </RolesSourceProvider>
    </main>
  )
}
