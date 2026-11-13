import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { LinkUsage, RetentionValue, SettingsSection, StatusCounts } from "@insyte/modules/settings/domain/Settings"
import {
  type Brand,
  type Privacy,
  RETENTION_COPY,
  SHIP_CARRIERS,
  type ShipStatus
} from "@insyte/ui/app/lib/settings-depth"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { DepthSection, PrivacyHere, Said, SettingsDepthSource } from "@insyte/ui/app/settings/depth/source"
import { Exit } from "effect"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { DEPTH, depthSections, depthWrites } from "../data/settings-depth.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The settings-depth pages in the console (M17 step 20.1b): one section of `WorkspaceSettings.get` as the design's
 * shape, saved whole through `WorkspaceSettings.save` over the version it was read at, with its undo. A save another
 * tab or a colleague beat says so and shows their version; one the server refused says why, and the page keeps what
 * was typed. Verzending's "Nu" is `Shipping.statusCounts`, Sjablonen' "In N sjablonen" `Templates.linkUsage`, the
 * logo goes up through `Brand.uploadLogo`, and Gegevens en privacy counts and switches through `Retention.*`.
 */

type Months = RetentionValue["classes"][number]["months"]

/** What the page's sections are called on the server. */
const SERVER: Record<Exclude<DepthSection, "domain">, SettingsSection["section"]> = {
  shipping: "shipping",
  links: "links",
  brand: "brand",
  vat: "vat",
  privacy: "retention"
}

/** A field the server refused, in the words the page uses. */
const INVALID: Record<string, string> = {
  review: "Een link begint met https:// en heeft een domein.",
  unsubscribe: "Een link begint met https:// en heeft een domein.",
  restock: "Een link begint met https:// en heeft een domein.",
  color: "Een kleur als #1F3A5F.",
  sender: "Geef een afzendernaam van hoogstens 60 tekens.",
  website: "De website is een link die begint met https:// en een domein heeft.",
  support: "Het supportadres is geen geldig e-mailadres.",
  logoFileId: "Het logo is er niet meer. Kies het opnieuw.",
  ossNumber: "Een nummer als NL123456789B01: landcode en dan cijfers.",
  required: "Elke status heeft een zin nodig die de klant leest.",
  too_long: "Een zin is hoogstens 120 tekens.",
  mime: "Kies een PNG, JPG, WebP of SVG.",
  too_large: "Kies er een tot 400 kB; het staat klein in mails en de chat."
}

const COPY: RefusalCopy = {
  gone: "Deze instellingen bestaan niet meer",
  conflicts: {
    stale_version: [
      "Iemand anders sloeg deze instellingen net op",
      "Je ziet nu de nieuwste versie. Breng je wijziging opnieuw aan."
    ]
  },
  invalid: INVALID
}

/** The server's section as the design's. */
const designOf = (section: SettingsSection, counts: StatusCounts | undefined) => {
  switch (section.section) {
    case "shipping":
      return SHIP_CARRIERS.map((c): ShipStatus => {
        const saved = section.value.statuses.find((s) => s.id === c.id)
        return { ...c, label: saved?.label ?? "", show: saved?.show ?? "all", orders: counts?.[c.id] ?? 0 }
      })
    case "links":
    // E-mail en domein reads its senders through `SendingDomain.get` (`domain-source.ts`); as a section, they are this.
    case "domain_senders":
      return { ...section.value }
    case "brand": {
      const { logoFileId: _, ...rest } = section.value
      return { ...rest, ...(section.logoUrl === null ? {} : { logo: section.logoUrl }) } satisfies Brand
    }
    case "vat":
      return { stores: [...section.value.stores], oss: section.value.oss, ossNumber: section.value.ossNumber }
    case "retention":
      return {
        classes: RETENTION_COPY.map((c) => ({
          ...c,
          months: section.value.classes.find((x) => x.id === c.id)?.months ?? null,
          count: 0
        })),
        erasing: section.state.erasing,
        ...(section.state.lastCount === null ? {} : { countedAt: new Date(section.state.lastCount.at).toISOString() })
      } satisfies Privacy
  }
}

/** The file id inside a logo's address (`/api/files/<id>`); none without a logo. */
const fileIdOf = (logo: string | undefined) => logo?.match(/\/api\/files\/([\w-]+)$/)?.[1] ?? null

/** The design's draft as the server's value. */
const valueOf = (key: DepthSection, next: unknown): unknown => {
  switch (key) {
    case "shipping":
      return { statuses: (next as Array<ShipStatus>).map((s) => ({ id: s.id, label: s.label, show: s.show })) }
    case "brand": {
      const { logo, ...rest } = next as Brand
      return { ...rest, logoFileId: fileIdOf(logo) }
    }
    case "privacy":
      return { classes: (next as Privacy).classes.map((c) => ({ id: c.id, months: c.months })) }
    default:
      return next
  }
}

const classesOf = (classes: ReadonlyArray<{ id: string; months: number | null }>) =>
  classes.map((c) => ({ id: c.id as RetentionValue["classes"][number]["id"], months: c.months as Months }))

/** The base64 of a picked file (at most `LOGO_BYTES`, so one string is fine). */
const base64Of = async (file: File) => {
  let binary = ""
  for (const byte of new Uint8Array(await file.arrayBuffer())) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

function usePrivacy(section: SettingsSection | undefined, refresh: () => void): PrivacyHere | undefined {
  const count = useAtomSet(depthWrites.count, { mode: "promiseExit" })
  const switchIt = useAtomSet(depthWrites.setErasing, { mode: "promiseExit" })
  const undo = useAtomSet(depthWrites.undo, { mode: "promiseExit" })
  const [counting, setCounting] = useState(false)
  if (section?.section !== "retention") return undefined
  const last = section.state.lastCount
  return {
    erasing: section.state.erasing,
    countedAt: last === null ? null : new Date(last.at).toISOString(),
    // A period changed since the count has no figure: counted again, it has.
    countOf: (c, months) =>
      last !== null && last.classes.find((x) => x.id === c.id)?.months === months ? (last.perClass[c.id] ?? 0) : null,
    counting,
    count: (classes) => {
      if (counting) return
      setCounting(true)
      void count({ payload: { classes: classesOf(classes) }, reactivityKeys: [...DEPTH] }).then((exit) => {
        setCounting(false)
        if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), COPY)
        refresh()
      })
    },
    setErasing: (on, said: Said) =>
      void switchIt({ payload: { on }, reactivityKeys: [...DEPTH] }).then((exit) => {
        if (Exit.isFailure(exit)) {
          const error = failureOf(exit) as { _tag?: string }
          if (error._tag === "NotCounted") {
            return void toast.error("Tel eerst wat er weg zou gaan", {
              description: "Tel de opgeslagen termijnen, dan kun je verwijderen aanzetten."
            })
          }
          return sayRefusal(error, COPY)
        }
        const token = exit.value.undo.token
        undoable(said.label, () =>
          void undo({ payload: { token }, reactivityKeys: [...DEPTH] }).then((done) => {
            if (Exit.isFailure(done)) sayRefusal(failureOf(done), COPY)
          }), said.detail)
      })
  }
}

export function useConsoleDepthSource(
  section: SettingsSection,
  extra: { counts?: StatusCounts | undefined; usage?: LinkUsage | undefined } = {}
): SettingsDepthSource {
  const save = useAtomSet(depthWrites.save, { mode: "promiseExit" })
  const upload = useAtomSet(depthWrites.uploadLogo, { mode: "promiseExit" })
  const undo = useAtomSet(depthWrites.undo, { mode: "promiseExit" })
  const refresh = useAtomRefresh(depthSections[section.section])
  const privacy = usePrivacy(section, refresh)
  const key = (Object.keys(SERVER) as Array<keyof typeof SERVER>).find((k) => SERVER[k] === section.section)!
  const saved = useMemo(() => designOf(section, extra.counts), [section, extra.counts])
  return {
    saved: { [key]: saved } as SettingsDepthSource["saved"],
    save: async (k, next, said) => {
      const exit = await save({
        payload: {
          section: SERVER[k as keyof typeof SERVER],
          value: valueOf(k, next) as never,
          baseVersion: section.version
        },
        reactivityKeys: [...DEPTH]
      })
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string; reason?: string }
        sayRefusal(error, COPY)
        // Beaten to it: the newest version is what the page shows now.
        if (error._tag === "Conflict" && error.reason === "stale_version") refresh()
        return false
      }
      const token = exit.value.undo.token
      undoable(said.label, () =>
        void undo({ payload: { token }, reactivityKeys: [...DEPTH] }).then((done) => {
          if (Exit.isFailure(done)) sayRefusal(failureOf(done), COPY)
        }), said.detail)
      return true
    },
    ...(extra.usage === undefined ? {} : { linkUsage: extra.usage }),
    ...(section.section === "vat" ? { stores: section.stores } : {}),
    ...(privacy === undefined ? {} : { privacy }),
    // 17TRACK is not linkable from the console yet (no marketplace): said, not offered.
    trackingUnavailable: true,
    uploadLogo: async (file) => {
      const exit = await upload({
        payload: { name: file.name, mime: file.type, data: await base64Of(file) }
      })
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string; fields?: Record<string, string> }
        const reason = error.fields?.["logo"]
        if (error._tag === "Invalid" && reason !== undefined) {
          return void toast(reason === "too_large" ? "Dat logo is te groot" : "Dat is geen logo", {
            description: INVALID[reason] ?? INVALID["mime"]
          })
        }
        return void sayRefusal(error, COPY)
      }
      return exit.value.url
    }
  }
}
