import { Link, paths } from "../router.tsx"
import { RadioGroup } from "../ui/checkbox.tsx"
import { Dialog } from "../ui/dialog.tsx"
import { Select } from "../ui/input.tsx"
import { AFFILIATE_STATEN, ROLLEN, setView, STATEN, useView } from "../view.ts"
import type { AffiliateStaat, Rol, Staat } from "../view.ts"
import { PACES, setPace, usePace } from "./loading.tsx"
import type { Pace } from "./loading.tsx"

/**
 * "Demoweergave": the design states of `/v2` in one place, for whoever reviews the screens. Which
 * state the data is in, which role you have, how far the affiliate's application is, which portal you
 * look through, and the screens that stand outside the shell. Design only (`view.ts`).
 */

/** The screens without the shell, as the current demo's persona menu lists them. */
const BARE_SCREENS: ReadonlyArray<{ readonly label: string; readonly to: string; readonly group: string }> = [
  { group: "Inloggen", label: "Inloggen", to: paths.login },
  { group: "Inloggen", label: "Tweestapsverificatie", to: paths.twoFactor },
  { group: "Inloggen", label: "Registreren", to: paths.register },
  { group: "Inloggen", label: "Wachtwoord herstellen", to: paths.resetPassword },
  { group: "Inrichten", label: "Inrichten · merk", to: paths.onboarding("merk") },
  { group: "Inrichten", label: "Inrichten · leverancier", to: paths.onboarding("leverancier") },
  { group: "Inrichten", label: "Inrichten · affiliate", to: paths.onboarding("affiliate") },
  { group: "Uitnodiging", label: "Nieuw account", to: paths.invitation("nieuw") },
  { group: "Uitnodiging", label: "Bestaand account", to: paths.invitation("bestaand") },
  { group: "Uitnodiging", label: "Ander account ingelogd", to: paths.invitation("ander-account") },
  { group: "Uitnodiging", label: "Via een link", to: paths.invitation("link-nw7k2q9d") },
  { group: "Uitnodiging", label: "SSO vereist", to: paths.invitation("sso") },
  { group: "Uitnodiging", label: "Werkruimte vol", to: paths.invitation("vol") },
  { group: "Uitnodiging", label: "Verlopen", to: paths.invitation("verlopen") },
  { group: "Uitnodiging", label: "Ingetrokken", to: paths.invitation("ingetrokken") },
  { group: "Uitnodiging", label: "Al geaccepteerd", to: paths.invitation("geaccepteerd") },
  { group: "Uitnodiging", label: "Leverancier", to: paths.invitation("leverancier") },
  { group: "Uitnodiging", label: "Affiliate", to: paths.invitation("affiliate") },
  { group: "Voor klanten", label: "Retourportaal", to: paths.returnPortal("northwind") },
  { group: "Voor klanten", label: "Kwaliteitscontrole", to: paths.qualityCheck("qc-301") }
]

const GROUPS = [...new Set(BARE_SCREENS.map((s) => s.group))]

export function DemoViewDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const view = useView()
  const pace = usePace()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Demoweergave"
      description="Alleen voor het ontwerp: elk scherm toont de staat, rol en het portaal die je hier kiest."
    >
      <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
        <RadioGroup<Staat>
          label="Staat van de gegevens"
          value={view.staat}
          onChange={(staat) => setView({ staat })}
          options={STATEN.map((s) => ({ value: s.id, label: s.label, description: s.detail }))}
        />
        <div className="flex flex-col gap-7">
          <div className="flex flex-col gap-2">
            <label htmlFor="demo-rol" className="text-sm font-medium text-ink">Rol</label>
            <Select id="demo-rol" value={view.rol} onChange={(e) => setView({ rol: e.target.value as Rol })}>
              {ROLLEN.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
            <p className="text-xs text-pretty text-ink-3">{ROLLEN.find((r) => r.id === view.rol)?.detail}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-ink">Bekijk als</p>
            <ul className="flex flex-col gap-1 text-sm">
              <li>
                <Link
                  to={paths.home}
                  onClick={onClose}
                  className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                >
                  Northwind, beheer
                </Link>
              </li>
              <li>
                <Link
                  to={paths.supplierPortal()}
                  onClick={onClose}
                  className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                >
                  Leverancier: Allure Fulfillment
                </Link>
              </li>
              <li>
                <Link
                  to={paths.affiliatePortal()}
                  onClick={onClose}
                  className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                >
                  Affiliate
                </Link>
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="demo-pace" className="text-sm font-medium text-ink">Laden</label>
            <Select id="demo-pace" value={pace} onChange={(e) => setPace(e.target.value as Pace)}>
              {PACES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
            <p className="text-xs text-pretty text-ink-3">{PACES.find((p) => p.id === pace)?.detail}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="demo-aff" className="text-sm font-medium text-ink">Aanvraag van de affiliate</label>
            <Select
              id="demo-aff"
              value={view.affiliate}
              onChange={(e) => setView({ affiliate: e.target.value as AffiliateStaat })}
            >
              {AFFILIATE_STATEN.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <p className="text-sm font-medium text-ink">Schermen zonder shell</p>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-4">
            {GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-xs text-ink-3">{group}</p>
                <ul className="flex flex-col">
                  {BARE_SCREENS.filter((s) => s.group === group).map((s) => (
                    <li key={s.to}>
                      <Link
                        to={s.to}
                        onClick={onClose}
                        className="flex min-h-7 items-center text-sm text-ink-2 hover:text-ink pointer-coarse:min-h-11"
                      >
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
