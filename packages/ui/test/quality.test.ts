import { describe, expect, it } from "vitest"
import {
  checkOverdue,
  complaintRate,
  counts,
  IllegalCheckMove,
  judge,
  mergeComplaints,
  type QualityCheck,
  shouldWatch,
  submit
} from "../src/app/lib/quality.ts"

const NOW = Date.parse("2026-11-01T12:00:00Z")
const check: QualityCheck = {
  id: "qc_1",
  productId: "prod_2000",
  supplierId: "sup_allure",
  kind: "batch",
  variants: [],
  deliver: ["photos", "batch"],
  due: new Date(NOW + 86_400_000).toISOString(),
  status: "requested",
  requestedAt: new Date(NOW).toISOString(),
  requestedBy: "Elena Hart",
  note: ""
}
const sub = { at: new Date(NOW).toISOString(), by: "Marco Rossi", photos: ["a.jpg"], video: false, batch: "AL-2611" }

describe("a quality check", () => {
  it("goes requested → submitted → approved", () => {
    const s = submit(check, sub)
    expect(s.status).toBe("submitted")
    expect(judge(s, true, { at: sub.at, by: "Elena Hart" }).status).toBe("approved")
  })

  it("needs a reason to reject, and can be submitted again after", () => {
    const s = submit(check, sub)
    expect(() => judge(s, false, { at: sub.at, by: "Elena Hart" })).toThrow()
    const r = judge(s, false, { at: sub.at, by: "Elena Hart", reason: "Naad bij de schouder" })
    expect(r.status).toBe("rejected")
    expect(submit(r, sub).status).toBe("submitted")
  })

  it("cannot be judged before the supplier has sent anything", () => {
    expect(() => judge(check, true, { at: sub.at, by: "x" })).toThrow(IllegalCheckMove)
  })

  it("is overdue once its date has passed without a submission", () => {
    expect(checkOverdue({ status: "requested", due: new Date(NOW - 1).toISOString() }, NOW)).toBe(true)
    expect(checkOverdue({ status: "submitted", due: new Date(NOW - 1).toISOString() }, NOW)).toBe(false)
  })
})

describe("the figures", () => {
  it("measures complaints against units sold", () => {
    expect(complaintRate(4, 65)).toBeCloseTo(0.0615, 3)
    expect(complaintRate(2, 0)).toBe(0)
  })

  it("counts checks by outcome", () => {
    expect(counts([{ status: "approved" }, { status: "approved" }, { status: "rejected" }, { status: "requested" }]))
      .toEqual({ approved: 2, rejected: 1, open: 1 })
  })

  it("proposes watching only above the threshold and only once", () => {
    expect(shouldWatch(0.062, 0.05, "active")).toBe(true)
    expect(shouldWatch(0.062, 0.05, "watch")).toBe(false)
    expect(shouldWatch(0.03, 0.05, "active")).toBe(false)
  })

  it("adds quality-marked returns that are not on file yet, and skips rejected ones", () => {
    const merged = mergeComplaints(
      [{
        id: "c1",
        productId: "prod_2010",
        at: "2026-10-01T00:00:00Z",
        text: "x",
        source: "return",
        returnId: "ret_1"
      }],
      [
        {
          id: "ret_1",
          quality: true,
          status: "resolved",
          createdAt: "2026-10-01T00:00:00Z",
          note: "x",
          customerName: "A",
          items: [{ productId: "prod_2010", variantTitle: "Middel" }]
        },
        {
          id: "ret_2",
          quality: true,
          status: "review",
          createdAt: "2026-10-31T00:00:00Z",
          note: "Rits kapot",
          customerName: "B",
          items: [{ productId: "prod_2010", variantTitle: "Groot" }]
        },
        {
          id: "ret_3",
          quality: true,
          status: "rejected",
          createdAt: "2026-10-30T00:00:00Z",
          note: "y",
          customerName: "C",
          items: [{ productId: "prod_2010", variantTitle: "Klein" }]
        }
      ]
    )
    expect(merged.map((c) => c.returnId)).toEqual(["ret_2", "ret_1"])
  })
})
