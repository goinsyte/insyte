import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { authClient } from "@insyte/ui/app/lib/auth-client"
import { PersonalProfilePage } from "@insyte/ui/app/settings/me-screen"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { User } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { toast } from "sonner"
import { frameAtom } from "../data/frame.ts"
import { teamAtom } from "../data/team.ts"

/**
 * Instellingen → Je profiel: the signed-in person's own name, from the frame (`Shell.frame`'s `me`), changed through
 * better-auth's `/update-user`, which holds it to a name that is said and not too long. Every member has it. Once it
 * took, the frame and the team read again, so the avatar menu and the member table say the new name.
 */
export const Route = createFileRoute("/_frame/settings/me")({
  head: () => ({ meta: [{ title: "Je profiel · Insyte" }] }),
  component: MeRoute
})

function MeRoute() {
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const refreshFrame = useAtomRefresh(frameAtom)
  const refreshTeam = useAtomRefresh(teamAtom)
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title="Je profiel" icon={User}>
        {frame === undefined ? null : (
          <PersonalProfilePage
            name={frame.me.name}
            email={frame.me.email}
            onSave={async (name) => {
              const { error } = await authClient.updateUser({ name })
              if (error !== null) {
                toast.error("Je naam is niet opgeslagen", { description: error.message })
                return false
              }
              refreshFrame()
              refreshTeam()
              return true
            }}
          />
        )}
      </SettingsSheet>
    </div>
  )
}
