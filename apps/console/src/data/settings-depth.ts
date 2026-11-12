import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { SendingDomainState } from "@insyte/modules/settings/domain/SendingDomain"
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
 * The settings-depth pages (M17 steps 20.1b and 20.1c): each page's section, E-mail en domein's domain, and
 * Verzending's counts and Sjablonen' link usage, primed by the route's loader and carried in the document. A save, a
 * count, the erase switch and a DNS check name `DEPTH`, so the page reads its section again (with the newest count).
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
  domain_senders: sectionAtom("domain_senders"),
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

/** E-mail en domein (20.1c): the domain, its records and the senders, read again after a check or a save. */
export const sendingDomainAtom = Atom.serializable(
  ConsoleClient.query("SendingDomain.get", undefined, { reactivityKeys: DEPTH }),
  {
    key: "settings-depth-sending-domain",
    schema: AsyncResult.Schema({ success: SendingDomainState, error: errors }),
    skipInitialRun: true
  }
)

export const depthWrites = {
  save: ConsoleClient.mutation("WorkspaceSettings.save"),
  uploadLogo: ConsoleClient.mutation("Brand.uploadLogo"),
  count: ConsoleClient.mutation("Retention.count"),
  setErasing: ConsoleClient.mutation("Retention.setErasing"),
  verifyDomain: ConsoleClient.mutation("SendingDomain.verify"),
  saveSenders: ConsoleClient.mutation("SendingDomain.saveSenders"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
