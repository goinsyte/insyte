export type CustomerStatus = "new" | "loyal" | "at_risk" | "duplicate"

const MAP: Record<CustomerStatus, { label: string; bg: string; fg: string }> = {
  new: { label: "Nieuw", bg: "var(--arc-tint)", fg: "var(--arc-ink)" },
  loyal: { label: "Trouw", bg: "var(--arc-tint)", fg: "var(--arc-ink)" },
  at_risk: {
    label: "Risico",
    bg: "var(--signal-red-bg)",
    fg: "var(--signal-red)"
  },
  duplicate: {
    label: "Dubbel",
    bg: "var(--signal-amber-bg)",
    fg: "var(--signal-amber)"
  }
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const meta = MAP[status]
  return (
    <span
      className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
      style={{ backgroundColor: meta.bg, color: meta.fg }}
    >
      {meta.label}
    </span>
  )
}

export function deriveCustomerStatus(c: {
  orders_count: number
  id: string
}): CustomerStatus {
  // deterministic pseudo-random based on id
  const seed = c.id.charCodeAt(c.id.length - 1)
  // "Duplicate" is not derived here: it is what `lib/duplicates.ts` finds by comparing profiles.
  if (c.orders_count >= 10) return "loyal"
  if (c.orders_count <= 2) return "new"
  if (seed % 7 === 0) return "at_risk"
  return "loyal"
}
