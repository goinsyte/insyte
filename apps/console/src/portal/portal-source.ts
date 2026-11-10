import { useAtomSet } from "@effect/atom-react"
import type { PortalOrder, PortalStore } from "@insyte/modules/returns/domain/Portal"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import type {
  LineRefusal,
  LookupProblem,
  PortalOrderView,
  PortalPhoto,
  PortalSource,
  SubmitProblem
} from "@insyte/ui/app/returns/portal/source"
import { Exit } from "effect"
import { useRef } from "react"
import { portalWrites } from "../data/portal.ts"
import { failureOf } from "../frame/refusals.ts"

/*
 * The returns portal in the console (M9.3), over `Portal.*`: the store's page from the loader, an order found with
 * Turnstile's token, photos sent one by one to `PUT /api/portal/photos` with the order's token, and the request. The
 * request's confirmation goes by mail to the address the order was found with (step 11.3), so the done page says so.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const refusalOf = (r: PortalOrder["lines"][number]["return"]): LineRefusal | null =>
  r === null ? null : r.kind === "window" ? { kind: "window", days: r.days, closesOn: iso(r.closesOn) } : r

const viewOf = (order: PortalOrder): PortalOrderView => ({
  number: order.number,
  firstName: order.firstName,
  deliveredAt: order.deliveredAt === null ? null : iso(order.deliveredAt),
  currency: order.currency as Currency,
  open: order.open,
  lines: order.lines.map((l) => ({
    id: l.id,
    title: l.title,
    variantTitle: l.variantTitle,
    unitPrice: l.unitPriceMinor / 100,
    image: l.image ?? undefined,
    return: refusalOf(l.return),
    claim: refusalOf(l.claim),
    rule: l.rule,
    exchange: l.exchange
  }))
})

const tagOf = (exit: Exit.Failure<unknown, unknown>) => {
  const error = failureOf(exit)
  return typeof error === "object" && error !== null && "_tag" in error
    ? error as { _tag: string; lineId?: string }
    : null
}

const LOOKUP: Record<string, LookupProblem> = {
  OrderNotFound: "not_found",
  PortalNotFound: "not_found",
  PortalRateLimited: "rate_limited",
  HumanCheckFailed: "human_check"
}

export function useConsolePortalSource(handle: string, store: PortalStore | null): PortalSource {
  const lookup = useAtomSet(portalWrites.lookup, { mode: "promiseExit" })
  const start = useAtomSet(portalWrites.start, { mode: "promiseExit" })
  const token = useRef<string | null>(null)

  return {
    store: store === null
      ? null
      : {
        name: store.name,
        on: store.on,
        intro: store.intro,
        done: store.done,
        returnDays: store.returnDays,
        claimDays: store.claimDays,
        reasons: store.reasons,
        offered: store.offered,
        giftCardBonus: store.giftCardBonusPct,
        claimSteps: store.claimSteps
      },
    numberPlaceholder: "#1042",
    lookup: async (number, email, human) => {
      const exit = await lookup({ payload: { handle, number, email, ...(human === undefined ? {} : { human }) } })
      if (Exit.isSuccess(exit)) {
        token.current = exit.value.token
        return { ok: true, order: viewOf(exit.value) }
      }
      return { ok: false, problem: LOOKUP[tagOf(exit)?._tag ?? ""] ?? "failed" }
    },
    addPhotos: async (files) => {
      const photos: Array<PortalPhoto> = []
      let problem: "type" | "size" | "failed" | undefined
      for (const file of files) {
        const response = await fetch("/api/portal/photos", {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-portal-token": token.current ?? "",
            "x-file-name": encodeURIComponent(file.name)
          },
          body: file
        }).catch(() => null)
        if (response?.status === 201) {
          const { id } = await response.json() as { id: string }
          photos.push({ id, name: file.name, url: URL.createObjectURL(file) })
        } else {
          problem = response?.status === 415 ? "type" : response?.status === 413 ? "size" : "failed"
        }
      }
      return { photos, problem }
    },
    submit: async (request) => {
      const exit = await start({
        payload: {
          token: token.current ?? "",
          kind: request.kind,
          lines: request.lineIds.map((lineId) => ({ lineId })),
          reasonId: request.reasonId,
          ...(request.note.trim() === "" ? {} : { note: request.note.trim() }),
          fileIds: [...request.photoIds],
          resolution: request.resolution,
          ...(request.exchangeTo === undefined ? {} : { exchangeTo: request.exchangeTo })
        }
      })
      if (Exit.isSuccess(exit)) {
        return { ok: true, made: { ...exit.value, mailed: true } }
      }
      const tagged = tagOf(exit)
      const problem: SubmitProblem = tagged?._tag === "PortalTokenExpired" || tagged?._tag === "PortalNotFound"
        ? { kind: "expired" }
        : tagged?._tag === "LineNotReturnable"
        ? { kind: "line", lineId: tagged.lineId ?? "" }
        : tagged?._tag === "PhotoRequired"
        ? { kind: "photo" }
        : tagged?._tag === "ResolutionNotAllowed"
        ? { kind: "resolution" }
        : tagged?._tag === "PortalRateLimited"
        ? { kind: "rate_limited" }
        : { kind: "failed" }
      return { ok: false, problem }
    }
  }
}
