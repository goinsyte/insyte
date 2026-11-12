import { ShortcutsPage } from "@insyte/ui/app/settings/depth/shortcuts-screen"
import { SettingsSheet } from "@insyte/ui/app/settings/settings-sheet"
import { Keyboard } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"

/**
 * Instellingen → Sneltoetsen (M17 step 20.1b): the member's own G-keys, from the frame's `Prefs.shortcuts`
 * (`ShellSource.settingsDepth`), so they hold on every device the member signs in on. Every member has them.
 */
export const Route = createFileRoute("/_frame/settings/shortcuts")({
  head: () => ({ meta: [{ title: "Sneltoetsen · Insyte" }] }),
  component: ShortcutsRoute
})

function ShortcutsRoute() {
  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <SettingsSheet title="Sneltoetsen" icon={Keyboard}>
        <ShortcutsPage />
      </SettingsSheet>
    </div>
  )
}
