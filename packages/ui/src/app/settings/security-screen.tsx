import { toast } from "sonner"
import { MonitorSmartphone, ShieldCheck, Smartphone } from "../../icons"
import { PageGuide } from "../common/page-guide"
import { exportCsv } from "../lib/bulk"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useSettings } from "../stores/settings-store"
import { SettingCard, StatusPill } from "./setting-card"

const SESSIONS = [
  {
    id: "mac-chrome",
    device: "MacBook Pro · Chrome",
    location: "Amsterdam, NL",
    last: "Nu actief",
    current: true
  },
  {
    id: "iphone-safari",
    device: "iPhone 15 · Safari",
    location: "Amsterdam, NL",
    last: "2 uur geleden",
    current: false
  },
  {
    id: "linux-firefox",
    device: "Linux · Firefox",
    location: "Berlin, DE",
    last: "Gisteren",
    current: false
  }
]

/** The trail the Export button writes out. Seeded, like the rest of the demo. */
const AUDIT = [
  ["2026-10-27 18:42", "Elena Hart", "Rol gewijzigd", "Financiën kan nu chargeback-bewijs indienen", "Amsterdam, NL"],
  ["2026-10-27 09:15", "Elena Hart", "API-sleutel aangemaakt", "Magazijnsynchronisatie", "Amsterdam, NL"],
  ["2026-10-26 16:03", "Ethan Jeppesen", "Bestelling terugbetaald", "Bestelling #1042, US$ 89,00", "Berlin, DE"],
  ["2026-10-25 11:20", "Elena Hart", "App geïnstalleerd", "Klaviyo", "Amsterdam, NL"],
  [
    "2026-10-24 14:58",
    "Sofía Kim",
    "Teamlid uitgenodigd",
    "liam@northwindclothing.co als Klantenservice",
    "Amsterdam, NL"
  ],
  ["2026-10-22 08:31", "Elena Hart", "Tweestapsverificatie ingeschakeld", "Hele werkruimte", "Amsterdam, NL"],
  ["2026-10-19 19:47", "Ethan Jeppesen", "Klanten geëxporteerd", "1.284 rijen", "Berlin, DE"],
  ["2026-10-15 10:02", "Elena Hart", "Winkel gekoppeld", "Northwind EU", "Amsterdam, NL"]
] as const

const GUIDE = [
  {
    title: "Tweestapsverificatie",
    body:
      "Bij het inloggen een tweede stap, met een authenticator-app of sms. Verplicht je het, dan worden teamleden zonder 2FA geblokkeerd tot ze het instellen.",
    art: "lock"
  },
  { title: "Google SSO", body: "Teamleden loggen in met hun Google Workspace-account.", art: "keys" },
  {
    title: "Auditlog",
    body:
      "Een alleen-lezen spoor van elke gevoelige beheeractie. Na 90 dagen wordt het gearchiveerd en is het op verzoek beschikbaar.",
    art: "log"
  }
] as const

export function SecurityPage() {
  const mfa = useSettings((s) => s.mfa)
  const enforce = useSettings((s) => s.enforceMfa)
  const sso = useSettings((s) => s.sso)
  const setAuth = useSettings((s) => s.setAuth)
  const revoked = useSettings((s) => s.revokedSessions)
  const revokeSession = useSettings((s) => s.revokeSession)
  const restoreSession = useSettings((s) => s.restoreSession)
  const sessions = SESSIONS.filter((s) => !revoked.includes(s.id))

  return (
    <>
      <SettingCard title="Authenticatie">
        <Toggle
          label="Tweestapsverificatie"
          checked={mfa}
          onChange={(v) => {
            setAuth({ mfa: v })
            toast.success(v ? "2FA verplicht" : "2FA optioneel")
          }}
        />
        <Toggle
          label="2FA verplichten voor alle teamleden"
          checked={enforce}
          onChange={(v) => {
            setAuth({ enforceMfa: v })
            toast.success(v ? "2FA-verplichting aan" : "2FA-verplichting uit")
          }}
        />
        <Toggle
          label="Google SSO"
          checked={sso}
          onChange={(v) => {
            setAuth({ sso: v })
            toast.success(v ? "Google SSO ingeschakeld" : "Google SSO uitgeschakeld")
          }}
        />
      </SettingCard>

      <SettingCard title="Actieve sessies">
        <ul className="overflow-hidden rounded-xl ">
          {sessions.map((s, i) => {
            const Icon = s.device.includes("iPhone")
              ? Smartphone
              : MonitorSmartphone
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-3 bg-paper px-4 py-3",
                  i < sessions.length - 1 && "border-hairline border-b"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mist">
                    <Icon className="size-5 text-ink-3" strokeWidth={1.75} />
                  </span>
                  <div>
                    <p className="font-medium text-base text-ink leading-[1.4]">
                      {s.device}
                    </p>
                    <p className="font-normal text-sm text-ink-3 leading-[1.4]">
                      {s.location} · {s.last}
                    </p>
                  </div>
                </div>
                {s.current ? <StatusPill tone="success" label="Dit apparaat" /> : (
                  <button
                    type="button"
                    onClick={() => {
                      revokeSession(s.id)
                      undoable(`${s.device} uitgelogd`, () => restoreSession(s.id))
                    }}
                    className="font-medium text-base text-signal-red hover:underline"
                  >
                    Intrekken
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </SettingCard>

      <SettingCard
        title="Auditlog"
        action={
          <button
            type="button"
            onClick={() => exportCsv("insyte-audit-log", ["Tijd", "Teamlid", "Actie", "Detail", "Locatie"], AUDIT)}
            className="flex h-8 items-center gap-2 rounded-md bg-paper px-3 py-1.5 font-medium text-base text-ink hover:bg-mist"
          >
            Exporteren
          </button>
        }
      >
        <div className="flex items-center gap-3 rounded-xl bg-mist p-4">
          <ShieldCheck
            className="size-5 shrink-0 text-signal-green"
            strokeWidth={1.75}
          />
          <p className="font-normal text-base text-ink-3 leading-[1.6]">
            Bewaard: <span className="font-medium text-ink">90 dagen</span>
          </p>
        </div>
      </SettingCard>
      <PageGuide id="settings.security" title="Beveiliging" steps={GUIDE} />
    </>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl p-4">
      <p className="font-medium text-base text-ink leading-[1.4]">
        {label}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors",
          checked ? "bg-abyss" : "bg-mist"
        )}
      >
        <span
          className={cn(
            "inline-block size-4 transform rounded-full bg-paper shadow transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  )
}
