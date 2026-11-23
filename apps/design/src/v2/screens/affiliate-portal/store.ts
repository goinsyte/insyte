import { useSyncExternalStore } from "react"
import { PAYMENT, PRIYA } from "../../fixtures/affiliate-portal.ts"
import type { PayoutMethod, ReferralLink } from "../../fixtures/affiliate-portal.ts"
import { toast } from "../../ui/toast.tsx"

/**
 * What the affiliate changed in this visit: the links it made, its name, where payouts go, which
 * notifications it read. Kept in memory, as the current demo's `affiliate-store` keeps it in the
 * browser; a reload starts from the fixtures again.
 */
export type AffiliateState = {
  readonly made: ReadonlyArray<ReferralLink>
  readonly name: string
  readonly payment: { readonly method: PayoutMethod; readonly account: string; readonly taxId: string }
  readonly read: ReadonlySet<string>
}

let state: AffiliateState = { made: [], name: PRIYA.name, payment: PAYMENT, read: new Set() }
const listeners = new Set<() => void>()

export const getAffiliate = () => state

export function setAffiliate(next: (s: AffiliateState) => AffiliateState) {
  state = next(state)
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useAffiliate(): AffiliateState {
  return useSyncExternalStore(subscribe, getAffiliate)
}

/** A change with "Ongedaan maken": the state before it comes back on a press. */
export function changeWithUndo(title: string, next: (s: AffiliateState) => AffiliateState, body?: string) {
  const before = state
  setAffiliate(next)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    action: { label: "Ongedaan maken", onClick: () => setAffiliate(() => before) }
  })
}

/** An account as the server would show it back: never whole. */
export function mask(account: string) {
  const a = account.trim()
  if (a.includes("@")) {
    const [user = "", host = ""] = a.split("@")
    return `${user.slice(0, 1)}•••@${host}`
  }
  return a.length <= 6 ? a : `${a.slice(0, 2)}•• •••• •••• ${a.slice(-4)}`
}
