import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import {
  LinkUsage,
  SettingsSection,
  type SettingsSectionId,
  StatusCounts
} from "@insyte/modules/settings/domain/Settings"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The settings-depth pages (M17 step 20.1b): each page's section, and Verzending's counts and Sjablonen' link usage,
 * primed by the route's loader and carried in the document. A save, a count and the erase switch name `DEPTH`, so the
 * page reads its section again (with the newest count).
 */

export const DEPTH = ["settings-depth"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

const sectionAtom = (section: SettingsSectionId) =>
  Atom.serializable(ConsoleClient.query("WorkspaceSettings.get", { section }, { reactivityKeys: DEPTH }), {
    key: `settings-depth-${section}`,
    schema: AsyncResult.Schema({ success: SettingsSection, error: errors }),
    skipInitialRun: true
  })

export const depthSections = {
  shipping: sectionAtom("shipping"),
  links: sectionAtom("links"),
  brand: sectionAtom("brand"),
  vat: sectionAtom("vat"),
  retention: sectionAtom("retention")
} as const

export const statusCountsAtom = Atom.serializable(
  ConsoleClient.query("Shipping.statusCounts", undefined, { reactivityKeys: DEPTH }),
  {
    key: "settings-depth-status-counts",
    schema: AsyncResult.Schema({ success: StatusCounts, error: errors }),
    skipInitialRun: true
  }
)

export const linkUsageAtom = Atom.serializable(
  ConsoleClient.query("Templates.linkUsage", undefined, { reactivityKeys: DEPTH }),
  {
    key: "settings-depth-link-usage",
    schema: AsyncResult.Schema({ success: LinkUsage, error: errors }),
    skipInitialRun: true
  }
)

export const depthWrites = {
  save: ConsoleClient.mutation("WorkspaceSettings.save"),
  uploadLogo: ConsoleClient.mutation("Brand.uploadLogo"),
  count: ConsoleClient.mutation("Retention.count"),
  setErasing: ConsoleClient.mutation("Retention.setErasing"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
