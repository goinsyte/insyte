import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/dialog"
import { Switch } from "../../components/switch"
import type { Extension } from "../lib/types/domain"
import { useSettings } from "../stores/settings-store"
import { useWorkspace } from "../stores/workspace-store"
import { FEATURES_FOR, vendorName } from "./app-catalog"
import { BrandLogo } from "./brand-logos"

/*
 * The design's in-place app, for a host with no place of its own to open an app in: its settings live in the design's
 * settings store, so the Marketplace and Instellingen → Apps load it only when the host has no `open`
 * (`marketplace-source.ts`), and a host without the design's stores never reads them.
 */

const PRIMARY =
  "flex h-9 items-center justify-center rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"

const GENERIC_SETTINGS = [
  "Nieuwe bestellingen automatisch synchroniseren",
  "Updates in de inbox plaatsen",
  "Klantlabels delen"
]

/**
 * An installed app opened inside Insyte. There is no vendor behind it in the demo, so it shows what
 * a connected app would: who it is, that it is connected, and a few settings that stick.
 */
export function OpenAppDialog({
  extension,
  open,
  onOpenChange
}: {
  extension: Extension | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const workspace = useWorkspace((s) => s.account.workspace)
  const values = useSettings((s) => (extension ? s.appSettings[extension.id] : undefined))
  const setAppSetting = useSettings((s) => s.setAppSetting)
  if (!extension) return null
  const ext = extension
  const settings = (FEATURES_FOR[ext.id] ?? GENERIC_SETTINGS).slice(0, 3)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <header className="flex items-center gap-3.5 px-5 pt-5 pr-14 pb-4">
          <BrandLogo extId={ext.id} name={ext.name} size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle>{ext.name}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5 text-sm">
              <span className="size-1.5 shrink-0 rounded-full bg-signal-green" aria-hidden />
              Gekoppeld aan {workspace}
            </DialogDescription>
          </div>
        </header>
        <div className="flex flex-col gap-1 px-5 pb-5">
          <p className="pb-2 text-sm text-ink-3">
            Door {vendorName(ext.name)} · Zojuist gesynchroniseerd
          </p>
          <ul className="flex flex-col overflow-hidden rounded-lg">
            {settings.map((label, i) => {
              const checked = values?.[label] ?? i < 2
              return (
                <li key={label} className="flex items-center justify-between gap-4 px-3 py-2.5 odd:bg-mist">
                  <span className="text-base text-ink leading-snug">{label}</span>
                  <Switch
                    checked={checked}
                    aria-label={label}
                    onCheckedChange={(v) => {
                      setAppSetting(ext.id, label, v)
                      toast.success(`${label} ${v ? "aan" : "uit"}`)
                    }}
                  />
                </li>
              )
            })}
          </ul>
        </div>
        <footer className="flex items-center justify-end bg-mist px-5 py-3">
          <button type="button" onClick={() => onOpenChange(false)} className={PRIMARY}>
            Klaar
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
