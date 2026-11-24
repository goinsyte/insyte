import { DEMO_NOW, ME } from "../fixtures/workspace.ts"
import { Link, paths } from "../router.tsx"
import { useSaved } from "../screens/settings/parts.tsx"
import { Eye, Shield } from "../ui/icons.tsx"
import { rolLabel, ROLLEN, setView, useView } from "../view.ts"
import type { Rol } from "../view.ts"

/*
 * The lines across the top of the work that say the console is not quite your own right now: while
 * you look at it through another role, and while Insyte's support looks along. One dark line each,
 * saying what it means and the way out; every member sees the support line.
 */

const OWN: Rol = ROLLEN.find((r) => r.label === ME.role)?.id ?? "eigenaar"

const LINE =
  "flex min-h-8 shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 bg-ink px-3 py-1 text-xs text-on-ink"
const ACTION = "rounded-xs font-medium underline decoration-on-ink/40 underline-offset-2 hover:decoration-on-ink"

export function ShellBanners() {
  const view = useView()
  const [support] = useSaved("privacy.support", { on: false, days: "7" })
  const until = new Date(DEMO_NOW.date.getTime() + Number(support.days) * 86_400_000)
    .toLocaleDateString("nl-NL", { day: "numeric", month: "long" })
  return (
    <>
      {view.rol !== OWN && (
        <div role="status" className={LINE}>
          <Eye size={14} aria-hidden="true" className="shrink-0 opacity-70" />
          <span>
            Je bekijkt Insyte als{" "}
            <span className="font-medium">{rolLabel(view.rol)}</span>: wat die rol niet mag, zie je niet of alleen
            lezend.
          </span>
          <button type="button" className={ACTION} onClick={() => setView({ rol: OWN })}>
            Terug naar {rolLabel(OWN)}
          </button>
        </div>
      )}
      {support.on && (
        <div role="status" className={LINE}>
          <Shield size={14} aria-hidden="true" className="shrink-0 opacity-70" />
          <span>
            <span className="font-medium">Insyte-support kijkt mee</span> tot {until}, alleen lezen
          </span>
          <Link to={`${paths.settings("privacy")}#support`} className={ACTION}>Instellingen</Link>
        </div>
      )}
    </>
  )
}
