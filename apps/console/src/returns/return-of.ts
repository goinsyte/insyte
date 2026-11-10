import type {
  ReturnDetail,
  ReturnEvent as ServerEvent,
  ReturnLine,
  ReturnRow,
  ReturnSettingsDoc
} from "@insyte/modules/returns/domain/Returns"
import type { ReturnEvent, ReturnItem, ReturnRecord, ReturnSettings } from "@insyte/ui/app/lib/returns"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import type { ReturnView } from "@insyte/ui/app/returns/source"

/*
 * The server's returns as the design's (M9.1): minor units to major, epoch milliseconds to ISO strings, the settings
 * document to the page's draft and back. A list row has no lines, so it carries what it is worth and how many units;
 * a return's page has its lines, its photos and its history.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const itemOf = (l: typeof ReturnLine.Type): ReturnItem => ({
  lineId: l.id,
  productId: l.productId ?? "",
  ...(l.variantId === null ? {} : { variantId: l.variantId }),
  title: l.title,
  variantTitle: l.variantTitle,
  qty: l.qty,
  unitPrice: l.unitPriceMinor / 100
})

const eventOf = (e: typeof ServerEvent.Type): ReturnEvent => ({
  at: iso(e.at),
  who: e.who,
  ...(e.name === null ? {} : { name: e.name }),
  text: e.text
})

export const recordOf = (
  r: ReturnRow,
  detail?: Pick<ReturnDetail, "lines" | "events" | "photos">
): ReturnRecord => ({
  id: r.id,
  number: r.number,
  kind: r.kind,
  orderId: r.orderId,
  orderNumber: r.orderNumber,
  customerId: r.customerId ?? "",
  customerName: r.customerName,
  customerEmail: r.customerEmail ?? "",
  storeId: r.storeId,
  country: r.country ?? "",
  currency: r.currency as Currency,
  items: detail?.lines.map(itemOf) ?? [],
  amount: r.amountMinor / 100,
  units: r.units,
  reason: r.reasonId,
  note: r.note,
  photos: [...(detail?.photos ?? [])],
  requested: r.requested,
  exchangeTo: r.exchangeTo ?? undefined,
  status: r.status,
  createdAt: iso(r.createdAt),
  deadline: iso(r.deadline),
  deliveredAt: iso(r.deliveredAt ?? r.createdAt),
  label: r.label === null
    ? undefined
    : { carrier: r.label.carrier, tracking: r.label.tracking, sentAt: iso(r.label.sentAt), self: r.label.self },
  labelPending: r.labelRequest?.state === "requested",
  labelFailed: r.labelRequest?.state === "failed" ? r.labelRequest.reason ?? "de vervoerder weigerde" : undefined,
  assignee: r.assigneeId ?? undefined,
  quality: r.quality,
  tags: [...r.tags],
  resolution: r.resolution === null ? undefined : {
    kind: r.resolution.kind,
    amount: r.resolution.amountMinor / 100,
    at: iso(r.resolution.at),
    by: r.resolution.by,
    replacementOrder: r.resolution.replacementOrder?.number,
    shopify: r.resolution.shopify === null ? undefined : {
      state: r.resolution.shopify.state,
      reason: r.resolution.shopify.reason ?? undefined,
      scope: r.resolution.shopify.scope ?? undefined,
      code: r.resolution.shopify.code ?? undefined,
      order: r.resolution.shopify.order ?? undefined
    }
  },
  rejectReason: r.rejectReason ?? undefined,
  events: detail?.events.map(eventOf) ?? []
})

/** One return with what the server's rules say about it. */
export const viewOf = (d: ReturnDetail): ReturnView => ({
  record: recordOf(d.record, d),
  reasonLabel: d.record.reasonLabel,
  photoRequired: d.photoRequired,
  window: {
    inside: d.window.inside,
    daysSince: d.window.daysSince,
    days: d.window.days,
    closesOn: new Date(d.window.closesOn)
  },
  rule: d.rule === null ? undefined : { kind: d.rule.kind, note: d.rule.note },
  offered: d.allowed.map((a) => a.kind),
  earlier: d.earlierReturns,
  address: d.address === null ? undefined : { address: d.address.address, carrier: d.address.carrier },
  assignee: d.assignee ?? undefined,
  imageOf: (item) => d.lines.find((l) => l.id === item.lineId)?.image ?? undefined,
  labelHref: d.record.label?.fileId ? `/api/files/${d.record.label.fileId}` : undefined
})

export const settingsOf = (d: ReturnSettingsDoc): ReturnSettings => ({
  returnDays: d.returnDays,
  claimDays: d.claimDays,
  specialWindows: d.specialWindows.map((w) => ({ ...w })),
  reasons: d.reasons.map((r) => ({
    id: r.id,
    label: r.label,
    claim: r.claim,
    photoRequired: r.photoRequired,
    quality: r.quality,
    ...(r.windowDays === null ? {} : { windowDays: r.windowDays })
  })),
  rules: d.rules.map((r) => ({ id: r.id, kind: r.kind, target: { ...r.target }, note: r.note })),
  offered: [...d.offered],
  giftCardBonus: d.giftCardBonusPct,
  exchangeFee: d.exchangeFeeMinor / 100,
  addresses: d.addresses.map((a) => ({ ...a })),
  claimSteps: [...d.claimSteps],
  portal: { ...d.portal }
})

/** The page's draft as the document `Returns.setSettings` takes; what the page does not edit is kept as saved. */
export const docOf = (s: ReturnSettings, saved: ReturnSettingsDoc): typeof ReturnSettingsDoc.Encoded => ({
  returnDays: s.returnDays,
  claimDays: s.claimDays,
  specialWindows: s.specialWindows.map((w) => ({ ...w })),
  reasons: s.reasons.map((r) => ({
    id: r.id,
    label: r.label,
    claim: r.claim,
    photoRequired: r.photoRequired,
    quality: r.quality,
    windowDays: r.windowDays ?? null
  })),
  rules: s.rules.map((r) => ({ id: r.id, kind: r.kind, target: { ...r.target }, note: r.note })),
  offered: [...s.offered],
  giftCardBonusPct: s.giftCardBonus,
  exchangeFeeMinor: Math.round(s.exchangeFee * 100),
  addresses: s.addresses.map((a) => ({ ...a })),
  claimSteps: [...s.claimSteps],
  rejectReasons: [...saved.rejectReasons],
  portal: { ...s.portal, handle: saved.portal.handle }
})
