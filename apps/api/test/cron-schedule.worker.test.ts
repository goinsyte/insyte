import { describe, expect, it } from "vitest"
import { jobsAt } from "../src/transports/jobs/Schedule.ts"

/*
 * Which jobs a cron turn starts, from its scheduled time (`Schedule.ts`). Production's cron fires every minute,
 * staging's every fifteenth (`infra/app.ts`): the quarter-hour jobs, the stores' reconcile among them, must be due on
 * every quarter and on no other minute, or a stage reconciles never or every minute.
 */

const at = (iso: string) => new Date(iso)
const EVERY_MINUTE = ["relay", "notify", "webhooksRearm", "pendingTasks"]

describe("the cron's jobs at a turn", () => {
  it("starts only the every-minute jobs between quarters", () => {
    for (const minute of ["01", "05", "14", "16", "25", "35", "44", "59"]) {
      expect(jobsAt(at(`2026-11-26T10:${minute}:00Z`)), `:${minute}`).toEqual(EVERY_MINUTE)
    }
  })

  it("reconciles the stores, with their sync health, on every quarter", () => {
    for (const minute of ["00", "15", "30", "45"]) {
      const jobs = jobsAt(at(`2026-11-26T10:${minute}:00Z`))
      expect(jobs, `:${minute}`).toEqual(expect.arrayContaining([...EVERY_MINUTE, "reconcile", "syncHealth"]))
      expect(jobs.filter((j) => j === "reconcile"), `:${minute}`).toHaveLength(1)
    }
  })

  it("starts the quarter's jobs at :15, and the hour's only on the hour", () => {
    expect(jobsAt(at("2026-11-26T10:15:00Z"))).toEqual([
      ...EVERY_MINUTE,
      "facts",
      "reconcile",
      "syncHealth",
      "tracking",
      "queue",
      "digest",
      "retention",
      "webhooksSweep"
    ])
    expect(jobsAt(at("2026-11-26T10:00:00Z"))).toEqual([
      ...EVERY_MINUTE,
      "facts",
      "reconcile",
      "syncHealth",
      "tracking",
      "queue",
      "digest",
      "deadlines",
      "supplierLate",
      "schedules",
      "redact",
      "retention",
      "webhooksSweep"
    ])
  })

  it("reads the rates at 02:00 UTC only", () => {
    expect(jobsAt(at("2026-11-26T02:00:00Z"))).toContain("rates")
    expect(jobsAt(at("2026-11-26T02:15:00Z"))).not.toContain("rates")
    expect(jobsAt(at("2026-11-26T03:00:00Z"))).not.toContain("rates")
  })

  it("runs the daily jobs at their hour, and the monthly close on the 1st only", () => {
    const three = jobsAt(at("2026-11-26T03:00:00Z"))
    expect(three).toEqual(expect.arrayContaining(["trash", "affiliates", "exports"]))
    expect(three).not.toContain("monthlyClose")
    expect(jobsAt(at("2026-12-01T03:00:00Z"))).toContain("monthlyClose")
    expect(jobsAt(at("2026-12-01T03:15:00Z"))).not.toContain("monthlyClose")
    expect(jobsAt(at("2026-11-26T04:00:00Z"))).toEqual(expect.arrayContaining(["adSpend", "sendingDomains"]))
    expect(jobsAt(at("2026-11-26T05:00:00Z"))).toContain("privacyExports")
    expect(jobsAt(at("2026-11-26T04:30:00Z"))).not.toContain("adSpend")
  })

  it("reads the time in UTC, whatever the hour elsewhere", () => {
    // 03:00 in Amsterdam is 02:00 UTC: the rates, not the Prullenbak.
    const jobs = jobsAt(at("2026-11-26T03:00:00+01:00"))
    expect(jobs).toContain("rates")
    expect(jobs).not.toContain("trash")
  })
})
