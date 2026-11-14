import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { QualityChange, QualityView } from "@insyte/modules/quality/domain/Quality"
import type { Complaint, QualityCheck } from "@insyte/ui/app/lib/quality"
import type { Product } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { ProductDetailSource } from "@insyte/ui/app/products/detail-source"
import { QualityTab } from "@insyte/ui/app/quality/quality-tab"
import {
  type QualityPicture,
  type QualitySource,
  QualitySourceProvider,
  type Said
} from "@insyte/ui/app/quality/source"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { PRODUCTS } from "../data/products.ts"
import { QUALITY, qualityAtom, qualityWrites } from "../data/quality.ts"
import { TICKETS } from "../data/tickets.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * The Kwaliteit tab in the console (M9.4), over `Quality.*`: the product's checks, complaints, rate and phase; asking
 * the supplier for a check, judging what came back and the phase, each with "Ongedaan maken". The supplier answers
 * through a link the team copies from the check (mail comes later), so the screens say "link", not "portaal". A
 * rejection can open a ticket with the supplier where the role may open tickets (Klantenservice · Bewerken); the
 * verdict's Undo takes it away. The agents' plate is left out.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const checkOf = (c: QualityView["checks"][number]): QualityCheck => ({
  id: c.id,
  productId: c.productId,
  supplierId: c.supplierId,
  kind: c.kind,
  variants: [...c.variants],
  deliver: [...c.deliverables],
  due: iso(c.dueAt),
  status: c.status,
  requestedAt: iso(c.requestedAt),
  requestedBy: c.requestedBy,
  note: c.note,
  submission: c.submission === null ? undefined : {
    at: iso(c.submission.at),
    by: c.submission.by,
    photos: [...c.submission.photos],
    video: c.submission.video,
    batch: c.submission.batch ?? undefined,
    note: c.submission.note ?? undefined
  },
  verdict: c.verdict === null
    ? undefined
    : { at: iso(c.verdict.at), by: c.verdict.by, reason: c.verdict.reason ?? undefined }
})

const pictureOf = (v: QualityView): QualityPicture => {
  const complaints: Array<Complaint> = v.complaints.map((c) => ({
    id: c.id,
    productId: v.productId,
    variant: c.variant ?? undefined,
    at: iso(c.at),
    text: c.text,
    source: "return",
    returnId: c.returnId,
    customer: c.customer
  }))
  return {
    checks: v.checks.map(checkOf),
    complaints,
    phase: v.phase,
    sold: v.sold90,
    rate: v.sold90 > 0 ? complaints.length / v.sold90 : 0,
    threshold: v.threshold,
    supplier: v.supplier,
    sizes: v.sizes,
    media: []
  }
}

const COPY: RefusalCopy = {
  gone: "Die controle bestaat niet meer",
  conflicts: { answered: ["Te laat om ongedaan te maken", "De leverancier heeft intussen geantwoord."] },
  invalid: { dueAt: "Kies een datum binnen twee maanden." },
  other: (tagged) => {
    switch (tagged._tag) {
      case "NoSupplier":
        toast.error("Geen leverancier", { description: "Koppel eerst een leverancier aan dit product." })
        return true
      case "IllegalCheckMove":
        toast.error("Dat kan nu niet meer", { description: "De controle is intussen veranderd." })
        return true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

function usePicture(productId: string): QualityPicture | undefined {
  const view = Option.getOrUndefined(AsyncResult.value(useAtomValue(qualityAtom(productId))))
  return useMemo(() => (view === undefined ? undefined : pictureOf(view)), [view])
}

function useConsoleQualitySource(): QualitySource {
  const write = {
    request: useAtomSet(qualityWrites.request, { mode: "promiseExit" }),
    approve: useAtomSet(qualityWrites.approve, { mode: "promiseExit" }),
    reject: useAtomSet(qualityWrites.reject, { mode: "promiseExit" }),
    setPhase: useAtomSet(qualityWrites.setPhase, { mode: "promiseExit" }),
    link: useAtomSet(qualityWrites.link, { mode: "promiseExit" }),
    undo: useAtomSet(qualityWrites.undo, { mode: "promiseExit" })
  }
  // The phase shows in the product's header and list too; a rejection's ticket is on the board.
  const keys = { reactivityKeys: [...QUALITY, ...PRODUCTS, ...TICKETS] }
  const tickets = useGate("support", 2)
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<QualityChange, unknown>, s: Said) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const token = exit.value.undo
    const opened = exit.value.ticket
    const detail = opened === undefined
      ? s.detail
      : `${s.detail ?? ""} Ticket #${opened.number} staat op het bord.`.trim()
    if (token === null) return void toast.success(s.label, { description: detail })
    undoable(s.label, () => undo(token.token), detail)
  }
  return {
    usePicture,
    commands: {
      request: async (productId, draft, s) =>
        said(
          await write.request({
            payload: {
              productId,
              kind: draft.kind,
              variants: [...draft.variants],
              deliverables: [...draft.deliver],
              dueAt: Date.parse(draft.due),
              note: draft.note
            },
            ...keys
          }),
          s
        ),
      approve: async (id, s) => said(await write.approve({ payload: { id }, ...keys }), s),
      reject: async (id, input, s) =>
        said(
          await write.reject({
            payload: { id, note: input.reason, watch: input.watch, ticket: input.ticket && tickets.ok },
            ...keys
          }),
          s
        ),
      // Start (M10) is not built yet: nothing says the product shows there.
      setPhase: async (productId, phase, s) =>
        said(await write.setPhase({ payload: { productId, phase }, ...keys }), { label: s.label })
    },
    gates: {
      request: useGate("products", 2),
      judge: useGate("quality.approve"),
      phase: useGate("products.phase")
    },
    tickets: tickets.ok,
    reach: "link",
    copyLink: async (id) => {
      const exit = await write.link({ payload: { id } })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      const url = `${window.location.origin}${exit.value.path}`
      await navigator.clipboard.writeText(url).then(
        () =>
          toast.success("Link gekopieerd", {
            description: "Stuur hem naar de leverancier; daarmee stuurt die de controle in."
          }),
        () => toast.error("Kopiëren lukte niet", { description: url })
      )
    }
  }
}

/** The tab, with its source, as the product page mounts it. */
function ConsoleQualityTab({ product, openCheck }: { product: Product; openCheck?: string | undefined }) {
  return (
    <QualitySourceProvider value={useConsoleQualitySource()}>
      <QualityTab product={product} openCheck={openCheck} />
    </QualitySourceProvider>
  )
}

/** The tab as the product page's source names it: one component, its open check read from the URL (`?check=`). */
function ConsoleQualityRouteTab({ product }: { product: Product }) {
  const { check } = useSearch({ strict: false }) as { check?: string }
  return <ConsoleQualityTab product={product} openCheck={check} />
}

/** The product page's Kwaliteit tab (M9.4): which tab the URL names, the header's figures, and the tab itself. */
export function useConsoleQuality(productId: string, tab: "overview" | "quality"): ProductDetailSource["quality"] {
  const navigate = useNavigate()
  const view = Option.getOrUndefined(AsyncResult.value(useAtomValue(qualityAtom(productId))))
  return {
    tab,
    setTab: (id) =>
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          tab: id === "quality" ? "quality" : undefined,
          check: undefined
        }),
        replace: true
      } as never),
    submitted: view?.checks.filter((c) => c.status === "submitted").length ?? 0,
    watching: view?.phase === "watch",
    Tab: ConsoleQualityRouteTab
  }
}
