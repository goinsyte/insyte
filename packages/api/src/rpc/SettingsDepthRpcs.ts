import { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import {
  SaveSenders,
  SendersChange,
  SendingDomainState,
  SetUpDomain
} from "@insyte/modules/settings/domain/SendingDomain"
import {
  CountRetention,
  ErasingChange,
  GetSection,
  LinkUsage,
  NotCounted,
  RetentionCount,
  SaveSection,
  SectionChange,
  SetErasing,
  SettingsSection,
  StatusCounts,
  UploadedLogo,
  UploadLogo
} from "@insyte/modules/settings/domain/Settings"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Settings depth (M17 track 1, steps 20.1b and 20.1c; api.md §2.34): Verzending, Sjablonen, Huisstijl, E-mail en
 * domein, Btw and Gegevens en privacy. Reading takes Instellingen · Bekijken; saving and checking the DNS again
 * Bewerken, retention's periods and turning the nightly erase on Beheren. A save over an older version is
 * `Conflict { reason: "stale_version" }`. Not reachable by an API key (`settings` is `api: false`).
 */
export class SettingsDepthRpcs extends RpcGroup.make(
  Rpc.make("WorkspaceSettings.get", { payload: GetSection, success: SettingsSection, error: Forbidden }),
  Rpc.make("WorkspaceSettings.save", {
    payload: SaveSection,
    success: SectionChange,
    error: Schema.Union([Forbidden, Invalid, Conflict])
  }),
  Rpc.make("Shipping.statusCounts", { success: StatusCounts, error: Forbidden }),
  Rpc.make("Templates.linkUsage", { success: LinkUsage, error: Forbidden }),
  Rpc.make("Brand.uploadLogo", {
    payload: UploadLogo,
    success: UploadedLogo,
    error: Schema.Union([Forbidden, Invalid])
  }),
  Rpc.make("Retention.count", {
    payload: CountRetention,
    success: RetentionCount,
    error: Schema.Union([Forbidden, Invalid])
  }),
  Rpc.make("Retention.setErasing", {
    payload: SetErasing,
    success: ErasingChange,
    error: Schema.Union([Forbidden, NotCounted])
  }),
  // E-mail en domein (20.1c): the sending domain and its records, setting it up, a check again, taking it away, and
  // the senders.
  Rpc.make("SendingDomain.get", { success: SendingDomainState, error: Forbidden }),
  Rpc.make("SendingDomain.verify", { success: SendingDomainState, error: Forbidden }),
  Rpc.make("SendingDomain.setUp", {
    payload: SetUpDomain,
    success: SendingDomainState,
    error: Schema.Union([Forbidden, Invalid])
  }),
  Rpc.make("SendingDomain.remove", { success: SendingDomainState, error: Forbidden }),
  Rpc.make("SendingDomain.saveSenders", {
    payload: SaveSenders,
    success: SendersChange,
    error: Schema.Union([Forbidden, Invalid, Conflict])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
