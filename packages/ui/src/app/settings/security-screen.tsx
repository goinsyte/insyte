import { useState } from "react"
import { toast } from "sonner"
import { MonitorSmartphone, ShieldCheck, Smartphone } from "../../icons"
import { PageGuide } from "../common/page-guide"
import { SoonChip } from "../common/soon-chip"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { type SessionRow, useSecuritySource } from "./security-source"
import { SettingCard, StatusPill } from "./setting-card"

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

/** What the host cannot do yet, said when it is asked for. */
const soon = (what: string) => () => toast(`${what} is nog niet beschikbaar`, { description: "Dit komt er nog aan." })

/** A switch the host can flip, with the design's toast; or, where it cannot yet, one that says so. */
const switchOf = (set: ((on: boolean) => void) | undefined, what: string, said: (on: boolean) => string) =>
  set === undefined ? { unavailable: soon(what) } : {
    onChange: (on: boolean) => {
      set(on)
      toast.success(said(on))
    }
  }

/**
 * Beveiliging: how members sign in, the reader's own signed-in sessions, and the audit log's export. What it reads and
 * does comes from its host (`security-source.tsx`). A session signed out where the host cannot bring it back gets no
 * Ongedaan maken.
 */
export function SecurityPage() {
  const source = useSecuritySource()
  const { sessions } = source
  const [revoking, setRevoking] = useState<string | null>(null)

  const revoke = async (s: SessionRow) => {
    setRevoking(s.id)
    const took = await source.revoke(s).finally(() => setRevoking(null))
    if (!took) return
    const restore = source.restore
    if (restore === undefined) toast.success(`${s.device} uitgelogd`)
    else undoable(`${s.device} uitgelogd`, () => restore(s.id))
  }

  return (
    <>
      <SettingCard title="Authenticatie">
        <Toggle
          label="Tweestapsverificatie"
          checked={source.twoFactor}
          {...switchOf(source.setTwoFactor, "Tweestapsverificatie", (on) => on ? "2FA verplicht" : "2FA optioneel")}
        />
        <Toggle
          label="2FA verplichten voor alle teamleden"
          checked={source.requireMfa}
          {...switchOf(
            source.setRequireMfa,
            "2FA verplichten",
            (on) => on ? "2FA-verplichting aan" : "2FA-verplichting uit"
          )}
        />
        <Toggle
          label="Google SSO"
          checked={source.googleSso}
          {...switchOf(
            source.setGoogleSso,
            "Google SSO",
            (on) => on ? "Google SSO ingeschakeld" : "Google SSO uitgeschakeld"
          )}
        />
      </SettingCard>

      <SettingCard title="Actieve sessies">
        <ul className="overflow-hidden rounded-xl ">
          {sessions.map((s, i) => {
            const Icon = /iPhone|Android/.test(s.device)
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
                    disabled={revoking !== null}
                    onClick={() => void revoke(s)}
                    className="font-medium text-base text-signal-red hover:underline disabled:pointer-events-none disabled:opacity-50"
                  >
                    {revoking === s.id ? "Intrekken…" : "Intrekken"}
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
            onClick={source.exportAudit ?? soon("De auditlog exporteren")}
            className="flex h-8 items-center gap-2 rounded-md bg-paper px-3 py-1.5 font-medium text-base text-ink hover:bg-mist"
          >
            Exporteren
            {source.exportAudit ? null : <SoonChip />}
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

/** A switch; `unavailable` instead of `onChange` where the host cannot flip it yet: it shows its state and says so. */
function Toggle({
  label,
  checked,
  onChange,
  unavailable
}: {
  label: string
  checked: boolean
  onChange?: (v: boolean) => void
  unavailable?: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl p-4">
      <p className="flex items-center gap-2 font-medium text-base text-ink leading-[1.4]">
        {label}
        {unavailable ? <SoonChip /> : null}
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-disabled={unavailable ? true : undefined}
        onClick={() => (unavailable ? unavailable() : onChange?.(!checked))}
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
