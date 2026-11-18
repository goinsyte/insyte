import { ConsoleClient } from "./client.ts"

/*
 * Insyte-support mag meekijken (M18): the owner's consent under Gegevens en privacy, and whether someone of Insyte's team
 * is looking along right now, which every member's frame shows as a line over the top bar. Turning it on or off, and a
 * session started or ended, reach every tab as a `support` change.
 */

export const SUPPORT = ["support"] as const

export const supportAtom = ConsoleClient.query("Support.status", undefined, { reactivityKeys: SUPPORT })

export const supportWrites = {
  setAccess: ConsoleClient.mutation("Support.setAccess")
} as const
