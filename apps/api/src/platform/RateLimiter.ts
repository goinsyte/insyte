import { DurableObject } from "cloudflare:workers"

/*
 * One instance per key (an IP, or the hash of an address), so a count is exact across isolates and regions (M2.3):
 * better-auth's own limiter keys by IP and path only, and per isolate. Two ledgers, in the instance's storage:
 *
 * - a fixed window that counts attempts (`take`): sign-ins per IP, sign-ups per IP, reset and verification mails per
 *   address;
 * - a failure ledger for one address's sign-ins (`fail`, `lockedFor`, `clear`): after `threshold` failures inside the
 *   window the address is locked, for `baseSeconds`, doubling with each lock after that (the exponential cool-down).
 *
 * Plain Durable Object RPC, no Effect: the class is constructed by the runtime, and its methods are a few storage
 * reads. The Worker reaches it through `RateLimits.ts`.
 */

interface Window {
  readonly start: number
  readonly count: number
}

interface Ledger {
  readonly failures: number
  readonly since: number
  readonly locks: number
  readonly until: number
}

export interface Taken {
  readonly ok: boolean
  readonly retryAfterSeconds: number
}

const NO_LEDGER: Ledger = { failures: 0, since: 0, locks: 0, until: 0 }

export class RateLimiter extends DurableObject {
  /** Counts one attempt in the current window; refuses it once `limit` attempts are in. */
  async take(bucket: string, limit: number, windowSeconds: number): Promise<Taken> {
    const now = Date.now()
    const window = (await this.ctx.storage.get<Window>(`window:${bucket}`)) ?? { start: now, count: 0 }
    const current = now - window.start >= windowSeconds * 1000 ? { start: now, count: 0 } : window
    if (current.count >= limit) {
      return { ok: false, retryAfterSeconds: Math.ceil((current.start + windowSeconds * 1000 - now) / 1000) }
    }
    await this.ctx.storage.put(`window:${bucket}`, { start: current.start, count: current.count + 1 })
    return { ok: true, retryAfterSeconds: 0 }
  }

  /** Seconds the address stays locked, and how many failures the current window holds. */
  async lockedFor(): Promise<{ readonly seconds: number; readonly failures: number }> {
    const ledger = (await this.ctx.storage.get<Ledger>("ledger")) ?? NO_LEDGER
    return { seconds: Math.max(0, Math.ceil((ledger.until - Date.now()) / 1000)), failures: ledger.failures }
  }

  /** One failed sign-in. Locks the address when the window reaches `threshold`; answers the lock's length, or 0. */
  async fail(threshold: number, windowSeconds: number, baseSeconds: number): Promise<number> {
    const now = Date.now()
    const ledger = (await this.ctx.storage.get<Ledger>("ledger")) ?? NO_LEDGER
    const fresh = now - ledger.since >= windowSeconds * 1000
    const failures = (fresh ? 0 : ledger.failures) + 1
    const since = fresh ? now : ledger.since
    if (failures < threshold) {
      await this.ctx.storage.put("ledger", { ...ledger, failures, since })
      return 0
    }
    const seconds = baseSeconds * 2 ** ledger.locks
    await this.ctx.storage.put("ledger", {
      failures: 0,
      since: now,
      locks: ledger.locks + 1,
      until: now + seconds * 1000
    })
    return seconds
  }

  /** A successful sign-in: the failures and the cool-down's doubling start over. */
  async clear(): Promise<void> {
    await this.ctx.storage.delete("ledger")
  }
}
