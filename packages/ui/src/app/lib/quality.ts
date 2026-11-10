/*
 * Product quality (PLAN 26, design §3): checks a brand asks its supplier for — photos of a batch, a
 * sample, a test order — what came back, the verdict, and the complaints that arrive through returns
 * and messages. Together they give a product its complaint rate and its phase.
 *
 * Pure: the words, the transitions, the rate and the counts, tested on their own.
 */

export type CheckKind = "sample" | "batch" | "test_order"

export const CHECK_KIND_LABEL: Record<CheckKind, string> = {
  sample: "Monstercontrole",
  batch: "Wekelijkse batchcontrole",
  test_order: "Testbestelling dropship"
}

export type Deliverable = "photos" | "video" | "batch" | "measurements"

export const DELIVERABLE_LABEL: Record<Deliverable, string> = {
  photos: "Foto's",
  video: "Video",
  batch: "Batchnummer",
  measurements: "Maten gemeten"
}

export type CheckStatus = "requested" | "submitted" | "approved" | "rejected"

export const CHECK_STATUS_LABEL: Record<CheckStatus, string> = {
  requested: "Aangevraagd",
  submitted: "Te beoordelen",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd"
}

export type Phase = "test" | "active" | "watch" | "phased_out"

export const PHASE_LABEL: Record<Phase, string> = {
  test: "Test",
  active: "Actief",
  watch: "Onder toezicht",
  phased_out: "Uitgefaseerd"
}

export type QualityCheck = {
  id: string
  productId: string
  supplierId: string
  kind: CheckKind
  /** The sizes it covers; empty is every size. */
  variants: string[]
  deliver: Deliverable[]
  due: string
  status: CheckStatus
  requestedAt: string
  requestedBy: string
  /** What the brand asked for, in its own words. */
  note: string
  submission?: {
    at: string
    by: string
    photos: string[]
    video: boolean
    batch?: string | undefined
    note?: string | undefined
  } | undefined
  verdict?: { at: string; by: string; reason?: string | undefined } | undefined
}

export type Complaint = {
  id: string
  productId: string
  variant?: string | undefined
  at: string
  text: string
  source: "return" | "message"
  returnId?: string | undefined
  customer?: string | undefined
}

export type QualitySeed = {
  checks: QualityCheck[]
  complaints: Complaint[]
  phases: Record<string, Phase>
  /** Units sold over the last 90 days, by product: what the complaint rate is measured against. */
  sold90: Record<string, number>
  /** Above this share the agent proposes putting the product under watch. */
  threshold: number
}

/* ── transitions ───────────────────────────────────────────────────────────────────────────── */

export class IllegalCheckMove extends Error {
  constructor(from: CheckStatus, move: string) {
    super(`Cannot ${move} a check that is ${from}`)
  }
}

export function submit(c: QualityCheck, s: NonNullable<QualityCheck["submission"]>): QualityCheck {
  if (c.status !== "requested" && c.status !== "rejected") throw new IllegalCheckMove(c.status, "submit")
  return { ...c, status: "submitted", submission: s, verdict: undefined }
}

export function judge(c: QualityCheck, approved: boolean, v: NonNullable<QualityCheck["verdict"]>): QualityCheck {
  if (c.status !== "submitted") throw new IllegalCheckMove(c.status, approved ? "approve" : "reject")
  if (!approved && !v.reason?.trim()) throw new Error("A rejection needs a reason the supplier can act on")
  return { ...c, status: approved ? "approved" : "rejected", verdict: v }
}

/** A check still waiting on the supplier after its due date. */
export const checkOverdue = (c: Pick<QualityCheck, "status" | "due">, now: number) =>
  c.status === "requested" && Date.parse(c.due) < now

/* ── the figures ───────────────────────────────────────────────────────────────────────────── */

/** Complaints per unit sold, as a fraction; nothing sold reads as zero. */
export const complaintRate = (complaints: number, sold: number) => (sold <= 0 ? 0 : complaints / sold)

export function counts(checks: ReadonlyArray<Pick<QualityCheck, "status">>) {
  return {
    approved: checks.filter((c) => c.status === "approved").length,
    rejected: checks.filter((c) => c.status === "rejected").length,
    open: checks.filter((c) => c.status === "requested" || c.status === "submitted").length
  }
}

/** Whether the agent should propose putting the product under watch: over the threshold and not already watched. */
export const shouldWatch = (rate: number, threshold: number, phase: Phase) =>
  rate > threshold && phase !== "watch" && phase !== "phased_out"

/** Merges the complaints on file with quality-marked returns not yet linked, so a new claim counts at once. */
export function mergeComplaints(
  onFile: ReadonlyArray<Complaint>,
  returns: ReadonlyArray<
    {
      id: string
      quality: boolean
      status: string
      createdAt: string
      note: string
      customerName: string
      items: ReadonlyArray<{ productId: string; variantTitle: string }>
    }
  >
): Complaint[] {
  const linked = new Set(onFile.map((c) => c.returnId).filter(Boolean))
  const fresh = returns
    .filter((r) => r.quality && r.status !== "rejected" && !linked.has(r.id))
    .flatMap((r) =>
      r.items.map((i, k) => ({
        id: `cmp_${r.id}_${k}`,
        productId: i.productId,
        variant: i.variantTitle,
        at: r.createdAt,
        text: r.note,
        source: "return" as const,
        returnId: r.id,
        customer: r.customerName
      }))
    )
  return [...onFile, ...fresh].sort((a, b) => b.at.localeCompare(a.at))
}
