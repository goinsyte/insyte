import { openProposals, useDemo } from "../demo.ts"
import { Link, paths } from "../router.tsx"
import { cx } from "../ui/cx.ts"
import { AlertTriangle } from "../ui/icons.tsx"
import { MagnusMark } from "../ui/magnus-mark.tsx"
import { useView } from "../view.ts"
import { useWorkspaces } from "./store-switcher.tsx"

/*
 * Two words on the main bar about the state of the work, left of Nieuw: how the stores' sync is (sync
 * health), and how many of Magnus's proposals wait for a yes. Both lead to where it is handled.
 */

type SyncLine = { readonly tone: "ok" | "warn" | "bad"; readonly label: string; readonly detail: string }

function syncLine(
  stores: ReadonlyArray<{ readonly name: string; readonly connected: boolean }>,
  failing: boolean
): SyncLine {
  if (failing) {
    return {
      tone: "bad",
      label: "Synchronisatie loopt niet",
      detail: "Shopify antwoordt sinds 14:12 niet. Insyte probeert het elke minuut opnieuw; er gaat niets verloren."
    }
  }
  const off = stores.find((s) => !s.connected)
  if (off !== undefined) {
    return {
      tone: "warn",
      label: `${off.name} ontkoppeld`,
      detail: `Van ${off.name} komen sinds 03:12 geen bestellingen binnen. Koppel de winkel opnieuw onder Winkels.`
    }
  }
  return {
    tone: "ok",
    label: stores.length === 1 ? "Winkel bij" : "Winkels bij",
    detail: "Alles is om 14:25 gesynchroniseerd."
  }
}

/**
 * The stores' sync in one line. While everything is read through it is a quiet word with a green dot,
 * and only where the bar has room: nothing to do, so it does not ask for the eye. A store that needs
 * the person wears the warning colour with its sign (never the colour alone) and shows from `md` up;
 * below `xl` as the sign alone, its words in the label.
 */
export function SyncStatus() {
  const { current } = useWorkspaces()
  const view = useView()
  const line = syncLine(current.stores, view.staat === "fout")
  const quiet = line.tone === "ok"
  return (
    <Link
      to={paths.settings("winkels")}
      title={line.detail}
      aria-label={`${line.label}. ${line.detail}`}
      className={cx(
        "h-7 min-w-0 shrink items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap transition-colors",
        quiet && "hidden text-ink-3 hover:bg-hover hover:text-ink-2 xl:flex",
        line.tone === "warn" && "hidden bg-warn-tint text-warn-ink hover:bg-warn-tint/70 md:flex",
        line.tone === "bad" && "hidden bg-bad-tint text-bad-ink hover:bg-bad-tint/70 md:flex"
      )}
    >
      {quiet
        ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-good" />
        : <AlertTriangle size={14} aria-hidden="true" className="shrink-0" />}
      <span className={cx("truncate", !quiet && "hidden xl:inline")}>{line.label}</span>
    </Link>
  )
}

/**
 * Magnus's proposals that wait for a yes, counted: the one control on the bar that leads to a
 * decision. None waiting is not a call to action, so it is a quiet word, and only on a wide bar.
 */
export function ProposalsChip() {
  const demo = useDemo()
  const count = openProposals(demo)
  return (
    <Link
      to={paths.approvals}
      aria-label={count === 0
        ? "Geen voorstellen"
        : `${count} ${count === 1 ? "voorstel wacht" : "voorstellen wachten"} op je ja`}
      className={cx(
        "h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap transition-colors",
        count === 0
          ? "hidden text-ink-3 hover:bg-hover hover:text-ink-2 xl:flex"
          : "flex bg-selected text-ink hover:bg-line"
      )}
    >
      <MagnusMark size={14} />
      {count === 0 ? "Geen voorstellen" : (
        <>
          <span className="figure">{count}</span>
          <span className="hidden lg:inline">{count === 1 ? "voorstel" : "voorstellen"}</span>
        </>
      )}
    </Link>
  )
}
