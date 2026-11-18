import { Forbidden, NoWorkspace, Unauthenticated, WorkspaceMismatch } from "@insyte/domain/Errors"
import {
  AffiliateList,
  ApplicationList,
  InviteLink,
  InviteRow,
  PayoutsView,
  ProgramView,
  ResourceRow
} from "@insyte/modules/affiliates/domain/Affiliates"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The brand's affiliates (M16 steps 3–5): the programme, its affiliates, applications, the month's payouts, open
 * invitations and the material, primed by `/affiliates`'s loader. Every write names `AFFILIATES`, and so does the
 * workspace's socket when an affiliate record changes (`realtime.ts`).
 */

export const AFFILIATES = ["affiliates"] as const

const errors = Schema.Union([Forbidden, WorkspaceMismatch, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
const keys = { reactivityKeys: AFFILIATES }

export const programAtom = Atom.serializable(ConsoleClient.query("Affiliates.program", undefined, keys), {
  key: "affiliates:program",
  schema: AsyncResult.Schema({ success: ProgramView, error: errors }),
  skipInitialRun: true
})

export const affiliatesListAtom = Atom.serializable(ConsoleClient.query("Affiliates.list", {}, keys), {
  key: "affiliates:list",
  schema: AsyncResult.Schema({ success: AffiliateList, error: errors }),
  skipInitialRun: true
})

export const applicationsAtom = Atom.serializable(ConsoleClient.query("Affiliates.applications.list", {}, keys), {
  key: "affiliates:applications",
  schema: AsyncResult.Schema({ success: ApplicationList, error: errors }),
  skipInitialRun: true
})

/** The month to approve: the one that closed last, else the running one ("loopt nog"). */
export const payoutsAtom = Atom.serializable(ConsoleClient.query("Affiliates.payouts.list", {}, keys), {
  key: "affiliates:payouts",
  schema: AsyncResult.Schema({ success: PayoutsView, error: errors }),
  skipInitialRun: true
})

export const invitesAtom = Atom.serializable(ConsoleClient.query("Affiliates.invites", undefined, keys), {
  key: "affiliates:invites",
  schema: AsyncResult.Schema({ success: Schema.Array(InviteRow), error: errors }),
  skipInitialRun: true
})

/** The programme's public page, which "Link kopiëren" hands out (an invitation's own link is in its mail). */
export const inviteLinkAtom = Atom.serializable(ConsoleClient.query("Affiliates.inviteLink", undefined, keys), {
  key: "affiliates:invite-link",
  schema: AsyncResult.Schema({ success: InviteLink, error: errors }),
  skipInitialRun: true
})

export const resourcesAtom = Atom.serializable(ConsoleClient.query("Affiliates.resources.list", undefined, keys), {
  key: "affiliates:resources",
  schema: AsyncResult.Schema({ success: Schema.Array(ResourceRow), error: errors }),
  skipInitialRun: true
})

export const affiliatesWrites = {
  /** "Deze maand" in an affiliate's dialog, read when it opens. */
  get: ConsoleClient.mutation("Affiliates.get"),
  setTier: ConsoleClient.mutation("Affiliates.setTier"),
  setPaused: ConsoleClient.mutation("Affiliates.setPaused"),
  approve: ConsoleClient.mutation("Affiliates.applications.approve"),
  reject: ConsoleClient.mutation("Affiliates.applications.reject"),
  proposeCode: ConsoleClient.mutation("Affiliates.proposeCode"),
  retryDiscount: ConsoleClient.mutation("Affiliates.retryDiscount"),
  approvePayouts: ConsoleClient.mutation("Affiliates.approvePayouts"),
  markPaid: ConsoleClient.mutation("Affiliates.markPaid"),
  invite: ConsoleClient.mutation("Affiliates.invite"),
  resend: ConsoleClient.mutation("Affiliates.invites.resend"),
  revoke: ConsoleClient.mutation("Affiliates.invites.revoke"),
  removeResource: ConsoleClient.mutation("Affiliates.resources.remove"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
