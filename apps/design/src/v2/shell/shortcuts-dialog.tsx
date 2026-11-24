import { GOTO_DEFAULTS, SCREEN_KEYS } from "../fixtures/settings.ts"
import { Link, paths } from "../router.tsx"
import { Dialog } from "../ui/dialog.tsx"
import { Kbd } from "../ui/kbd.tsx"
import { useGotoKeys } from "./keys.ts"
import { closeOverlay, useShellState } from "./shell-state.ts"

/**
 * The shortcuts, on ? from anywhere: the person's own G keys (as set under Instellingen →
 * Sneltoetsen, so a key changed there shows here at once), then the keys that belong to a screen.
 */
export function ShortcutsDialog() {
  const { overlay } = useShellState()
  const keys = useGotoKeys()
  return (
    <Dialog
      open={overlay === "shortcuts"}
      onClose={closeOverlay}
      title="Sneltoetsen"
      description="Ze werken nooit terwijl je typt."
      size="lg"
    >
      <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
        <section className="flex flex-col gap-1" aria-labelledby="keys-goto">
          <h3 id="keys-goto" className="pb-1 text-xs font-semibold text-ink-3">Ga naar</h3>
          {keys.on
            ? GOTO_DEFAULTS.map((g) => <Row key={g.id} what={g.label} keys={["G", keys.map[g.id] ?? g.key]} />)
            : <p className="py-1 text-sm text-ink-3">Staan uit.</p>}
          <Link
            to={paths.settings("sneltoetsen")}
            onClick={closeOverlay}
            className="self-start pt-2 text-xs text-ink-3 underline decoration-line-strong underline-offset-2 hover:text-ink"
          >
            {keys.on ? "Toetsen wijzigen" : "Aanzetten"} onder Instellingen
          </Link>
        </section>
        <div className="flex flex-col gap-6">
          {SCREEN_KEYS.map((group) => (
            <section key={group.group} className="flex flex-col gap-1" aria-label={group.group}>
              <h3 className="pb-1 text-xs font-semibold text-ink-3">{group.group}</h3>
              {group.keys.map((row) => <Row key={row.what} what={row.what} keys={row.keys} />)}
              {group.group === "Overal" && <Row what="Deze sneltoetsen" keys={["?"]} />}
            </section>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

function Row({ what, keys }: { readonly what: string; readonly keys: ReadonlyArray<string> }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-ink-2">{what}</span>
      <span className="flex items-center gap-1" aria-label={keys.join(" dan ")}>
        {keys.map((k, i) => <Kbd key={`${k}-${i}`}>{k}</Kbd>)}
      </span>
    </div>
  )
}
