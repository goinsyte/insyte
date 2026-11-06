import { describe, expect, it } from "vitest"
import {
  type Article,
  diffLines,
  LIMIT,
  publishedVersion,
  revertTo,
  saveVersion,
  statusOf
} from "../src/app/lib/knowledge.ts"

const at = "2026-11-01T10:00:00Z"
const base: Article = {
  id: "kb_1",
  title: "Retourneren",
  audience: "both",
  body: "30 dagen",
  versions: [{ n: 1, at, by: "Elena Hart", body: "30 dagen", title: "Retourneren", published: true }],
  editedAt: at,
  editedBy: "Elena Hart",
  uses7d: 0
}

describe("an article", () => {
  it("is published when the working text is the published version", () => {
    expect(statusOf(base)).toBe("published")
    expect(statusOf({ ...base, body: "30 dagen, sale niet" })).toBe("changed")
    expect(statusOf({ ...base, versions: [{ ...base.versions[0]!, published: false }] })).toBe("draft")
  })

  it("publishes as a new version the agents read, and keeps a draft as one they do not", () => {
    const draft = saveVersion({ ...base, body: "30 dagen, sale niet" }, "Sofía Kim", at, false)
    expect(publishedVersion(draft)?.n).toBe(1)
    const pub = saveVersion(draft, "Sofía Kim", at, true)
    expect(publishedVersion(pub)?.n).toBe(3)
    expect(publishedVersion(pub)?.body).toBe("30 dagen, sale niet")
  })

  it("reverts to an earlier version by publishing it again", () => {
    const changed = saveVersion({ ...base, body: "14 dagen" }, "x", at, true)
    const back = revertTo(changed, 1, "Elena Hart", at)
    expect(back.body).toBe("30 dagen")
    expect(publishedVersion(back)?.n).toBe(3)
  })

  it("refuses a body over the limit", () => {
    expect(() => saveVersion({ ...base, body: "x".repeat(LIMIT + 1) }, "x", at, true)).toThrow()
  })
})

describe("the diff", () => {
  it("marks lines added and removed, keeping the rest", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" }
    ])
  })
})
