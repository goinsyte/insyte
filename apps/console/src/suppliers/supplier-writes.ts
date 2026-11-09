import { useAtomSet } from "@effect/atom-react"
import type { SupplierChange } from "@insyte/modules/suppliers/domain/Commands"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { ForwardPref, SupplierInput, SupplierRow } from "@insyte/ui/app/suppliers/source"
import { Exit, Redacted } from "effect"
import { toast } from "sonner"
import { PRODUCTS } from "../data/products.ts"
import { SUPPLIERS, supplierWrites } from "../data/suppliers.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The supplier commands in the console (M8.1): each the server's, refreshing what names `SUPPLIERS` and `PRODUCTS`,
 * with "Ongedaan maken" spending the command's undo token. Nothing here reaches Shopify.
 */

const COPY: RefusalCopy = {
  gone: "Die leverancier bestaat niet meer",
  invalid: {
    taken: "Er is al een leverancier met die naam.",
    contactEmail: "Dat e-mailadres klopt niet.",
    forwardEmail: "Dat e-mailadres klopt niet.",
    contactPhone: "Dat telefoonnummer klopt niet.",
    https: "Het adres moet met https:// beginnen."
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

const CHANNEL: Record<ForwardPref["via"], "portal" | "email" | "api"> = { portal: "portal", email: "email", api: "api" }

/** Every supplier command, as the screens call them. */
export function useSupplierCommands() {
  const keys = { reactivityKeys: [...SUPPLIERS, ...PRODUCTS] }
  const write = {
    create: useAtomSet(supplierWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(supplierWrites.update, { mode: "promiseExit" }),
    setPaused: useAtomSet(supplierWrites.setPaused, { mode: "promiseExit" }),
    assignProducts: useAtomSet(supplierWrites.assignProducts, { mode: "promiseExit" }),
    connectApi: useAtomSet(supplierWrites.connectApi, { mode: "promiseExit" }),
    disconnectApi: useAtomSet(supplierWrites.disconnectApi, { mode: "promiseExit" }),
    testConnection: useAtomSet(supplierWrites.testConnection, { mode: "promiseExit" }),
    undo: useAtomSet(supplierWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<SupplierChange, unknown>, message: string) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(message, () => undo(ticket.token))
  }

  return {
    save: async (input: SupplierInput, row?: SupplierRow) => {
      if (row === undefined) {
        return said(
          await write.create({
            payload: {
              name: input.name,
              contactEmail: input.contactEmail,
              contactPhone: input.contactPhone,
              description: input.description,
              defaultLeadDays: input.leadDays
            },
            ...keys
          }),
          `${input.name} toegevoegd`
        )
      }
      said(
        await write.update({
          payload: {
            id: row.id,
            name: input.name,
            contactEmail: input.contactEmail,
            contactPhone: input.contactPhone,
            description: input.description,
            defaultLeadDays: input.leadDays
          },
          ...keys
        }),
        `${input.name} opgeslagen`
      )
    },
    /** The selection paused, or resumed when every one of them is paused already. */
    pauseOrResume: async (rows: ReadonlyArray<SupplierRow>) => {
      const paused = !rows.every((r) => r.paused)
      said(
        await write.setPaused({ payload: { ids: rows.map((r) => r.id), paused }, ...keys }),
        rows.length === 1 ?
          `${rows[0]?.name} ${paused ? "gepauzeerd voor nieuwe bestellingen" : "hervat"}` :
          `${counted(rows.length, "leverancier", "leveranciers")} ${paused ? "gepauzeerd" : "hervat"}`
      )
    },
    setPref: async (row: SupplierRow, patch: Partial<ForwardPref>, message: string) =>
      said(
        await write.update({
          payload: {
            id: row.id,
            ...(patch.via === undefined ? {} : { forwardChannel: CHANNEL[patch.via] }),
            ...(patch.auto === undefined ? {} : { autoForward: patch.auto })
          },
          ...keys
        }),
        message
      ),
    /** Their API: connected, the secret answered this once; `undefined` when refused (and said why). */
    connectApi: async (row: SupplierRow, url: string) => {
      const exit = await write.connectApi({ payload: { id: row.id, url }, ...keys })
      if (Exit.isFailure(exit)) return void refused(failureOf(exit))
      toast.success(`API van ${row.name} gekoppeld`, { description: "Geef hen de sleutel; je ziet hem maar één keer." })
      return Redacted.value(exit.value.secret)
    },
    testConnection: async (row: SupplierRow) => {
      const exit = await write.testConnection({ payload: { id: row.id }, ...keys })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return { ok: false, ms: null, reason: "De test kon niet worden gedaan" }
      }
      return exit.value
    },
    disconnectApi: async (row: SupplierRow) => {
      const exit = await write.disconnectApi({ payload: { id: row.id }, ...keys })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      toast(`API van ${row.name} ontkoppeld`, {
        description: "Bestellingen gaan weer per e-mail tot je opnieuw koppelt."
      })
    },
    /** The product's supplier from its page. */
    assign: async (supplierId: string, productId: string, message: string) =>
      said(await write.assignProducts({ payload: { supplierId, productIds: [productId] }, ...keys }), message)
  }
}
