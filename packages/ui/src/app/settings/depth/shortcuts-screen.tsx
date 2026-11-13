import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Switch } from "../../../components/switch"
import { Keyboard, RotateCcw } from "../../../icons"
import { GOTO_DEFAULTS } from "../../lib/settings-depth"
import { undoable } from "../../lib/undo"
import { cn } from "../../lib/utils"
import { SHORTCUTS } from "../../shell/shell-dialogs"
import { useSettingsDepth } from "../../shell/state"
import { SettingCard } from "../setting-card"

const Kbd = ({ children, live }: { children: string; live?: boolean }) => (
  <kbd
    className={cn(
      "flex h-6 min-w-6 items-center justify-center rounded px-1.5 font-medium text-xs",
      live
        ? "bg-arc text-mesh-ink"
        : "bg-paper text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]"
    )}
  >
    {children}
  </kbd>
)

/**
 * Sneltoetsen (`/settings/shortcuts`, PLAN 43): G and then a key to go to an area, each key yours to
 * change — click it and press the new one. A key already in use says so instead of taking it. The
 * keys that belong to a screen (a list, the queue, notifications) are listed under them as they are.
 */
export function ShortcutsPage() {
  const keys = useSettingsDepth((s) => s.keys)
  const on = useSettingsDepth((s) => s.gotoOn)
  // The keys are the frame's (`ShellSource.settingsDepth`): the design's store, or the member's preferences.
  const setKey = useSettingsDepth((s) => s.setKey)
  const resetKeys = useSettingsDepth((s) => s.resetKeys)
  const setGotoOn = useSettingsDepth((s) => s.setGotoOn)
  const [listening, setListening] = useState<string | null>(null)

  useEffect(() => {
    if (!listening) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") return setListening(null)
      const k = e.key.length === 1 ? e.key.toUpperCase() : ""
      if (!/^[A-Z0-9,.]$/.test(k)) return void toast("Kies een letter, een cijfer, een komma of een punt")
      if (k === "G") return void toast("G is de eerste toets", { description: "Kies een andere voor de tweede." })
      const taken = GOTO_DEFAULTS.find((g) => g.id !== listening && (keys[g.id] ?? g.key) === k)
      if (taken) {
        return void toast(`${k} gaat al naar ${taken.label}`, {
          description: "Kies een andere toets, of geef die eerst een nieuwe."
        })
      }
      const target = GOTO_DEFAULTS.find((g) => g.id === listening)!
      undoable(`G dan ${k} gaat naar ${target.label}`, setKey(listening, k))
      setListening(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [listening, keys, setKey])

  const changed = GOTO_DEFAULTS.some((g) => (keys[g.id] ?? g.key) !== g.key)
  return (
    <>
      <SettingCard
        title="Ga naar"
        icon={Keyboard}
        subtitle="Druk op G en dan op de toets. Nooit terwijl je typt."
        action={
          <span className="flex items-center gap-3">
            {changed ?
              (
                <button
                  type="button"
                  onClick={() => undoable("Sneltoetsen terug naar standaard", resetKeys())}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-xs hover:bg-ink/6 hover:text-ink"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  Standaard
                </button>
              ) :
              null}
            <label className="flex items-center gap-2 text-ink-2 text-sm">
              <Switch checked={on} onCheckedChange={(v) => setGotoOn(v)} />
              {on ? "Aan" : "Uit"}
            </label>
          </span>
        }
      >
        <ul className={cn("grid grid-cols-1 gap-1 sm:grid-cols-2", !on && "opacity-50")}>
          {GOTO_DEFAULTS.map((g) => {
            const k = keys[g.id] ?? g.key
            const live = listening === g.id
            return (
              <li
                key={g.id}
                className="flex h-11 items-center justify-between gap-3 rounded-lg bg-paper px-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
              >
                <span className="text-ink text-sm">{g.label}</span>
                <button
                  type="button"
                  disabled={!on}
                  onClick={() => setListening(live ? null : g.id)}
                  aria-label={live
                    ? `Druk op een toets voor ${g.label}`
                    : `Toets voor ${g.label} veranderen, nu G dan ${k}`}
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-md px-1.5 transition-colors",
                    live ? "bg-arc-tint" : "hover:bg-ink/5"
                  )}
                >
                  <Kbd>G</Kbd>
                  <span className="text-ink-3 text-xs">dan</span>
                  {live ? <span className="px-1 text-arc-ink text-xs">druk op een toets…</span> : <Kbd>{k}</Kbd>}
                </button>
              </li>
            )
          })}
        </ul>
      </SettingCard>
      <SettingCard title="Op een scherm" subtitle="Deze horen bij een scherm en zijn vast.">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {SHORTCUTS.map((grp) => (
            <section key={grp.group} className="flex flex-col gap-1">
              <h3 className="font-medium text-ink-3 text-xs">{grp.group}</h3>
              {grp.keys.map((x) => (
                <div
                  key={x.what}
                  className="flex h-9 items-center justify-between gap-3 rounded-md bg-paper px-3 text-ink-2 text-sm shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
                >
                  {x.what}
                  <span className="flex gap-1">
                    {x.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </SettingCard>
    </>
  )
}
