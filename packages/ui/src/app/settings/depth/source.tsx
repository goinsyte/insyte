import { createContext, useContext } from "react"
import type { Retention, SettingsDepthSeed, TemplateLinks } from "../../lib/settings-depth"

/**
 * What the settings-depth pages (Verzending, Sjablonen, Huisstijl, E-mail en domein, Btw, Gegevens en privacy) read
 * and do, from whoever hosts them, as `notifications-source.tsx` is for Meldingen: the design app from its
 * settings-depth store, the console from `WorkspaceSettings.*`, `Shipping.statusCounts`, `Templates.linkUsage`,
 * `Brand.uploadLogo`, `Retention.*` (M17 step 20.1b) and `SendingDomain.*` (20.1c). A host gives the sections its page
 * shows; the rest may be absent.
 */

export type DepthSection = "shipping" | "links" | "brand" | "domain" | "vat" | "privacy"

/** What the toast says once a save landed. */
export interface Said {
  label: string
  detail?: string | undefined
}

/** One changed field as the Logboek lists it: what it is, what it was, what it became. */
export type FieldChange = [field: string, before: string, after: string]

/** Gegevens en privacy beyond its periods: the dry run and the nightly erase. */
export interface PrivacyHere {
  erasing: boolean
  /** When the newest count ran (ISO); none before the first. */
  countedAt: string | null
  /** What a class would take under `months`, as counted; null when nothing was counted for that period. */
  countOf: (c: Retention, months: number | null) => number | null
  /** A count is out: the button waits for it. */
  counting: boolean
  /** "Nu tellen", over the page's periods as they stand. */
  count: (classes: ReadonlyArray<Retention>) => void
  /** The switch, after the page's own confirm when it goes on; the host says what it did (with its Undo). */
  setErasing: (on: boolean, said: Said) => void
}

/**
 * E-mail en domein beyond its senders: where the domain stands and the check again. `ready` shows the records; the rest
 * say honestly why there are none: sending from your own domain is not available here, no domain is set up yet, the
 * domain is in use elsewhere, or its records could not be fetched. A host that can set the domain up and take it away
 * gives `setUp` and `remove`; without them the page offers neither.
 */
export interface DomainHere {
  state: "ready" | "unavailable" | "unclaimed" | "taken" | "failed"
  /** A check is out: the button spins and waits for it. */
  checking: boolean
  /** "Opnieuw controleren"; the host says what it found. */
  check: () => void
  /** A set-up or a removal is out: its button waits for it. */
  busy?: boolean | undefined
  /** "Domein instellen", with the name as typed; the host says what came of it. */
  setUp?: ((name: string) => void) | undefined
  /** "Domein verwijderen", after the page's confirm. */
  remove?: (() => void) | undefined
}

export interface SettingsDepthSource {
  saved: { [K in DepthSection]?: SettingsDepthSeed[K] }
  /**
   * Saves one section whole; the host says what it did (with its Undo) or why it did not. Resolves whether it saved: a
   * page that did not keeps what was typed.
   */
  save: <K extends DepthSection>(
    key: K,
    next: SettingsDepthSeed[K],
    said: Said,
    log: { page: string; to: string; changes: ReadonlyArray<FieldChange> }
  ) => Promise<boolean>
  /** How many reply templates use each fixed link; absent, the page's own figures. */
  linkUsage?: Partial<Record<keyof TemplateLinks, number>> | undefined
  /** The stores Btw lists, by id and name. */
  stores?: ReadonlyArray<{ id: string; name: string }> | undefined
  privacy?: PrivacyHere | undefined
  domain?: DomainHere | undefined
  /**
   * Keeps a picked logo and answers where it is now shown from, or nothing when it was refused (the host said why);
   * absent, the page reads the file into the draft itself.
   */
  uploadLogo?: ((file: File) => Promise<string | undefined>) | undefined
  /** Verzending's tracking service cannot be linked here yet: the page says so instead of offering Koppelen. */
  trackingUnavailable?: boolean | undefined
}

const Context = createContext<SettingsDepthSource | null>(null)

export const SettingsDepthSourceProvider = Context.Provider

export function useSettingsDepthSource(): SettingsDepthSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The settings-depth pages need a SettingsDepthSourceProvider around them.")
  return source
}
