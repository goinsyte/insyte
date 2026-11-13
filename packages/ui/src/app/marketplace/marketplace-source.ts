import type { Extension } from "../lib/types/domain"

/**
 * What the Marketplace, an app's detail, its dialogs and Instellingen → Apps read and do, from whoever hosts them (as
 * `security-source.tsx` is for Beveiliging): the design app from its marketplace and settings stores, the console from
 * `Marketplace.*` (M17 step 3). It travels on the shell's source, so the rail and the Manage popup read the same
 * installs. The markup is the design's; what the host cannot do is said, never pretended.
 */

export interface InstallRecord {
  id: string
  installedAt: string
  lastOpenedAt?: string
}

export interface MarketplaceSource {
  /** The catalogue as the cards draw it, in its order. Empty until it is in. */
  apps: ReadonlyArray<Extension>
  /** The console's first read of the catalogue and the installs; the design is always ready. */
  status: "ready" | "loading" | "error"
  retry?: () => void
  records: Record<string, InstallRecord>
  installedIds: Array<string>
  isInstalled: (id: string) => boolean
  getRecord: (id: string) => InstallRecord | undefined
  /** "Aanbevolen voor jou", by app id. */
  recommended: ReadonlyArray<string>
  /** The app cannot be installed here yet: the card says Binnenkort and nothing installs. */
  soon: (id: string) => boolean
  /** The host says what came of it (a toast, a provider's approval page, a key shown once). */
  install: (ext: Extension) => void
  /** The host confirms what goes when it cannot come back, and offers Ongedaan maken when it can. */
  uninstall: (ext: Extension) => void
  markOpened: (id: string) => void
  /** Opens the app where it lives in this host. Absent: the design's in-place app dialog. */
  open?: (ext: Extension) => void
  /** The scopes taken back from an installed app, as the detail lists them. */
  revokedScopes: (id: string) => ReadonlyArray<string>
  /** Whether Insyte can narrow the app's scopes; an app whose rights are its provider's grant cannot. */
  canRescope: (id: string) => boolean
  setRevokedScopes: (ext: Extension, revoked: ReadonlyArray<string>) => void
  /** "Feedback sturen": whether it was kept; a failure keeps what was written. */
  sendFeedback: (input: { category: string; message: string }) => Promise<boolean>
}
