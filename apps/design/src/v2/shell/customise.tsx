import { Button, IconButton } from "../ui/button.tsx"
import { Dialog } from "../ui/dialog.tsx"
import { ArrowDown, ArrowUp } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { toast } from "../ui/toast.tsx"
import { Toggle } from "../ui/toggle.tsx"
import { useView } from "../view.ts"
import type { Section } from "./sections.ts"
import { sectionVisible, TOOLS, visibleGroups } from "./sections.ts"
import { closeOverlay, setRail, useShellState } from "./shell-state.ts"

/**
 * Zijbalk aanpassen: the rail as the person works. The areas in their order within each group (up
 * and down), the ones they never use hidden, and the tools from Meer they use daily pinned to the
 * rail. Every change applies as it is made, so there is no Opslaan; closing is done. Start stays,
 * because it is where the day begins.
 */
export function CustomiseDialog() {
  const { overlay, rail } = useShellState()
  const view = useView()
  const rank = (id: string) => {
    const at = rail.order.indexOf(id)
    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }
  const groups = visibleGroups(view).map((group) =>
    group.map((s, i) => ({ s, i })).toSorted((a, b) => rank(a.s.id) - rank(b.s.id) || a.i - b.i).map((x) => x.s)
  )
  const changed = rail.order.length > 0 || rail.hidden.length > 0 || rail.pinned.length > 0

  const move = (group: number, from: number, step: -1 | 1) => {
    const next = groups.map((g) => [...g])
    const list = next[group]
    const a = list?.[from]
    const b = list?.[from + step]
    if (list === undefined || a === undefined || b === undefined) return
    list[from] = b
    list[from + step] = a
    setRail({ ...rail, order: next.flat().map((s) => s.id) })
  }
  const toggleHidden = (id: string, show: boolean) =>
    setRail({ ...rail, hidden: show ? rail.hidden.filter((h) => h !== id) : [...rail.hidden, id] })
  const togglePinned = (id: string, on: boolean) =>
    setRail({ ...rail, pinned: on ? [...rail.pinned, id] : rail.pinned.filter((p) => p !== id) })

  return (
    <Dialog
      open={overlay === "customise"}
      onClose={closeOverlay}
      title="Zijbalk aanpassen"
      description="Richt de rail in zoals jij werkt. Het geldt alleen voor jou, en meteen."
      size="md"
      footer={
        <>
          {changed && (
            <Button
              variant="ghost"
              onClick={() => {
                const before = rail
                setRail({ order: [], hidden: [], pinned: [] })
                toast({
                  title: "Zijbalk terug naar standaard",
                  action: { label: "Ongedaan maken", onClick: () => setRail(before) }
                })
              }}
            >
              Terug naar standaard
            </Button>
          )}
          <Button variant="primary" onClick={closeOverlay}>Klaar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-labelledby="rail-areas">
          <h3 id="rail-areas" className="text-xs font-semibold text-ink-3">Gebieden</h3>
          {groups.map((group, g) => (
            <ul key={group[0]?.id} className="flex flex-col">
              {group.map((section, i) => {
                const shown = !rail.hidden.includes(section.id)
                return (
                  <li key={section.id} className="flex h-10 items-center gap-3">
                    <Mark section={section} muted={!shown} />
                    <span
                      className={shown
                        ? "min-w-0 flex-1 truncate text-sm text-ink"
                        : "min-w-0 flex-1 truncate text-sm text-ink-3"}
                    >
                      {section.label}
                    </span>
                    <span className="flex items-center">
                      <IconButton
                        label={`${section.label} omhoog`}
                        size="sm"
                        disabled={i === 0}
                        onClick={() => move(g, i, -1)}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        label={`${section.label} omlaag`}
                        size="sm"
                        disabled={i === group.length - 1}
                        onClick={() => move(g, i, 1)}
                      >
                        <ArrowDown />
                      </IconButton>
                    </span>
                    <Toggle
                      label={shown ? `${section.label} verbergen` : `${section.label} tonen`}
                      on={shown}
                      disabled={section.id === "start"}
                      onChange={(on) => toggleHidden(section.id, on)}
                    />
                  </li>
                )
              })}
            </ul>
          ))}
        </section>

        <section className="flex flex-col gap-1" aria-labelledby="rail-pinned">
          <h3 id="rail-pinned" className="text-xs font-semibold text-ink-3">Vastzetten uit Meer</h3>
          <p className="pb-2 text-xs text-ink-3">Wat je dagelijks gebruikt, staat dan op de rail onder de gebieden.</p>
          <ul className="flex flex-col">
            {TOOLS.map((tool) => {
              const may = sectionVisible(view, tool.id)
              const on = rail.pinned.includes(tool.id)
              return (
                <li key={tool.id} className="flex min-h-12 items-center gap-3 py-1">
                  <Mark section={tool} muted={!may} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={may ? "truncate text-sm text-ink" : "truncate text-sm text-ink-3"}>
                      {tool.label}
                    </span>
                    <span className="truncate text-xs text-ink-3">{may ? tool.detail : "Je rol opent dit niet"}</span>
                  </span>
                  <Toggle
                    label={on ? `${tool.label} losmaken` : `${tool.label} vastzetten`}
                    on={on && may}
                    disabled={!may}
                    onChange={(next) => togglePinned(tool.id, next)}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </Dialog>
  )
}

function Mark({ section, muted }: { readonly section: Section; readonly muted: boolean }) {
  const G = section.glyph
  return (
    <span
      className={muted
        ? "flex size-7 shrink-0 items-center justify-center text-ink-4"
        : "flex size-7 shrink-0 items-center justify-center text-ink-2"}
    >
      {G === null ? <MagnusMark size={17} /> : <G size={17} />}
    </span>
  )
}
