import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { SupplierCheck } from "@insyte/modules/quality/domain/Quality"
import type { LinkedCheck, QualityLinkSource } from "@insyte/ui/app/quality/link-source"
import { Exit } from "effect"
import { linkedCheckAtom, linkWrites } from "../data/quality.ts"
import { failureOf } from "../frame/refusals.ts"

/*
 * The supplier's link page in the console (M9.4), over `QualityLink.*`: the check the token names, each file sent to
 * `PUT /api/quality/media` with the token, then the answer; read again once it is in, so the card says it was sent.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const checkOf = (id: string, c: SupplierCheck): LinkedCheck => ({
  id,
  productId: "",
  supplierId: "",
  kind: c.kind,
  variants: [...c.variants],
  deliver: [...c.deliverables],
  due: iso(c.dueAt),
  status: c.status,
  requestedAt: iso(c.dueAt),
  requestedBy: "",
  note: c.note,
  submission: c.submittedAt === null ? undefined : { at: iso(c.submittedAt), by: "", photos: [], video: false },
  verdict: c.rejection === null ? undefined : { at: iso(c.dueAt), by: "", reason: c.rejection },
  productTitle: c.productTitle,
  productImage: c.productImage ?? undefined,
  supplierName: c.supplierName
})

const UPLOAD: Record<number, string> = {
  401: "Deze link werkt niet meer. Vraag om een nieuwe.",
  409: "Deze controle staat niet meer open.",
  413: "Een bestand is te groot: foto's tot 10 MB, video's tot 50 MB.",
  415: "Een bestand is geen foto of video.",
  429: "Te veel pogingen. Probeer het later opnieuw."
}

const SUBMIT: Record<string, string> = {
  LinkExpired: "Deze link werkt niet meer. Vraag om een nieuwe.",
  IllegalCheckMove: "Deze controle staat niet meer open.",
  PortalRateLimited: "Te veel pogingen. Probeer het later opnieuw."
}

export function useConsoleQualityLink(id: string, token: string, check: SupplierCheck | null): QualityLinkSource {
  const submit = useAtomSet(linkWrites.submit, { mode: "promiseExit" })
  const refresh = useAtomRefresh(linkedCheckAtom(token))
  return {
    check: check === null ? null : checkOf(id, check),
    brand: check?.brand ?? "",
    send: async ({ files, batch, note }) => {
      const fileIds: Array<string> = []
      for (const file of files) {
        const response = await fetch("/api/quality/media", {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-check-token": token,
            "x-file-name": encodeURIComponent(file.name)
          },
          body: file
        }).catch(() => null)
        if (response?.status !== 201) {
          return UPLOAD[response?.status ?? 0] ?? "Een bestand kwam niet door. Probeer het opnieuw."
        }
        fileIds.push(((await response.json()) as { id: string }).id)
      }
      const exit = await submit({
        payload: {
          token,
          fileIds,
          ...(batch === undefined ? {} : { batch }),
          ...(note === undefined ? {} : { note })
        }
      })
      if (Exit.isSuccess(exit)) {
        refresh()
        return null
      }
      const error = failureOf(exit) as { _tag?: string; what?: string }
      if (error._tag === "DeliverableMissing") {
        return error.what === "batch" ? "Vul het batchnummer in." : "Minstens één foto nodig."
      }
      return SUBMIT[error._tag ?? ""] ?? "Er ging iets mis. Probeer het opnieuw."
    }
  }
}
