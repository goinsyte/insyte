import { cx } from "./cx.ts"
import { Check, Moon, Sun } from "./icons.tsx"
import { ACCENTS, MODES, useTheme } from "./theme.ts"
import type { Accent, AccentOption } from "./theme.ts"
import { Segmented } from "./toggle.tsx"

/**
 * One swatch per accent theme. The swatch is not a colour written here: each is a tiny element with
 * its own `data-accent`, painted with `bg-accent`, so it shows exactly what the tokens make of that
 * theme in the current mode. A new theme in `tokens.css` and `ACCENTS` appears here by itself.
 * `options` narrows or widens the set (the Varianten panel adds a direction's own accents).
 */
export function AccentSwatches({ value, onChange, size = "md", options = ACCENTS }: {
  readonly value: Accent
  readonly onChange: (next: Accent) => void
  readonly size?: "sm" | "md"
  readonly options?: ReadonlyArray<AccentOption>
}) {
  return (
    <div role="radiogroup" aria-label="Accentkleur" className="flex flex-wrap items-center gap-1.5">
      {options.map((accent) => {
        const selected = accent.value === value
        return (
          <button
            key={accent.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={accent.label}
            title={`${accent.label} · ${accent.note}`}
            data-accent={accent.value}
            onClick={() => onChange(accent.value)}
            className={cx(
              "relative inline-flex items-center justify-center rounded-full bg-accent text-on-accent transition-shadow",
              size === "sm" ? "size-5" : "size-7",
              // A finger needs 44px, whatever the drawn size.
              "pointer-coarse:size-11",
              selected
                ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas"
                : "hover:ring-2 hover:ring-line-strong hover:ring-offset-1 hover:ring-offset-canvas"
            )}
          >
            {selected && <Check size={size === "sm" ? 11 : 14} strokeWidth={2.25} />}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The theme picker: the accent a workspace works in and light or dark. Shown in the avatar menu and
 * at the top of the kit. It writes two attributes on `<html>`; nothing else changes.
 */
export function ThemePicker({ layout = "row" }: { readonly layout?: "row" | "stack" }) {
  const { accent, mode, setAccent, setMode } = useTheme()
  const current = ACCENTS.find((a) => a.value === accent)
  return (
    <div className={cx("flex gap-3", layout === "stack" ? "flex-col" : "flex-wrap items-center")}>
      <div className="flex items-center gap-2.5">
        <AccentSwatches value={accent} onChange={setAccent} />
        <span className="text-xs text-ink-2">{current?.label}</span>
      </div>
      <Segmented
        size="sm"
        label="Weergave"
        value={mode}
        onChange={setMode}
        options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.value === "light" ? <Sun /> : <Moon /> }))}
      />
    </div>
  )
}
