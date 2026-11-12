import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Check, Key } from "../../icons"
import { SoonChip } from "../common/soon-chip"
import { CopyButton, Token } from "../developer/bits"
import { vendorName } from "./app-catalog"
import { BrandLogo } from "./brand-logos"

/*
 * A recipe app just installed (M17 step 3): the API key Insyte made for it, shown once, to paste into the app. It is the
 * key dialog's secret step (`developer/key-dialog.tsx`) in the app's own words. Events sent to the app wait for
 * Insyte's outbound webhooks (M19.4), and the dialog says so.
 */

const PRIMARY =
  "flex h-9 items-center justify-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98]"

export interface AppKey {
  appId: string
  name: string
  secret: string
  prefix: string
}

export function AppKeyDialog({ value, onClose }: { value: AppKey | null; onClose: () => void }) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        {value === null ? null : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <BrandLogo extId={value.appId} name={value.name} size={36} />
                <DialogTitle>{value.name} is geïnstalleerd</DialogTitle>
              </div>
              <DialogDescription>
                Plak deze sleutel in {vendorName(value.name)}{" "}
                om Insyte te koppelen. Insyte laat hem hierna nooit meer zien, ook jou niet.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3 rounded-lg bg-abyss p-4 text-mesh-ink">
              <span className="flex items-center gap-2 text-mesh-ink-2 text-sm">
                <Key className="size-3.5" strokeWidth={1.75} />
                Geheime sleutel
              </span>
              <span className="break-all rounded-md bg-mesh-ink/10 px-3 py-2.5 text-base text-mesh-ink tabular-nums leading-normal">
                {value.secret}
              </span>
              <CopyButton value={value.secret} tone="mesh" className="self-start" />
            </div>
            <p className="text-ink-2 text-sm leading-normal">
              Daarna zie je alleen nog het begin: <Token>{value.prefix}…</Token>, onder Instellingen, dan API-sleutels.
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-mist px-3 py-2.5">
              <span className="text-base text-ink">Events van Insyte naar {vendorName(value.name)} sturen</span>
              <SoonChip />
            </div>
            <DialogFooter>
              <button type="button" onClick={onClose} className={PRIMARY}>
                <Check className="size-4" strokeWidth={2} />
                Klaar
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
