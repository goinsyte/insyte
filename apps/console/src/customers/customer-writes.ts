import { useAtomSet } from "@effect/atom-react"
import type { CustomerChange } from "@insyte/modules/customers/domain/Commands"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import type { Customer } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { CUSTOMERS, customerWrites } from "../data/customers.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The customer commands in the console (M7.4): each the server's, refreshing what names `CUSTOMERS`, with "Ongedaan
 * maken" spending the command's undo token inside the window. A merge is Insyte's, and so is its undo.
 */

const COPY: RefusalCopy = {
  gone: "Die klant bestaat niet meer",
  conflicts: {
    merged: ["Al samengevoegd", "Een van deze profielen is al in een ander opgegaan."],
    absorbs: ["Eerst het andere profiel", "Een profiel waar al andere in zijn opgegaan, kan zelf niet meer opgaan."],
    no_store: ["Nog geen winkel", "Verbind eerst een winkel; daar komt de klant bij."]
  },
  invalid: {
    taken: "Er is al een klant met dit e-mailadres in deze winkel.",
    required: "Geef een e-mailadres of telefoonnummer op.",
    format: "Kijk het e-mailadres of de landcode nog eens na.",
    same: "Kies minstens twee verschillende profielen."
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

export interface NewCustomer {
  readonly name: string
  readonly email: string
  readonly phone: string
  readonly country: string
  readonly tags: ReadonlyArray<string>
}

/** Every customer command, as the screens call them. */
export function useCustomerCommands() {
  const keys = { reactivityKeys: CUSTOMERS }
  const write = {
    tag: useAtomSet(customerWrites.tag, { mode: "promiseExit" }),
    create: useAtomSet(customerWrites.create, { mode: "promiseExit" }),
    merge: useAtomSet(customerWrites.merge, { mode: "promiseExit" }),
    markNotDuplicate: useAtomSet(customerWrites.markNotDuplicate, { mode: "promiseExit" }),
    undo: useAtomSet(customerWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<CustomerChange, unknown>, message: string) => {
    if (Exit.isFailure(exit)) return void refused(failureOf(exit))
    const { undo: ticket, customers } = exit.value
    if (customers.length === 0 || ticket === null) return
    undoable(message, () => undo(ticket.token))
  }

  return {
    applyTags: async (rows: ReadonlyArray<Customer>, tags: ReadonlyArray<string>, mode: "add" | "remove") => {
      const what = tags.length === 1 ? `“${tags[0]}”` : `${tags.length} labels`
      const payload = {
        ids: rows.map((c) => c.id),
        add: mode === "add" ? [...tags] : [],
        remove: mode === "remove" ? [...tags] : []
      }
      said(
        await write.tag({ payload, ...keys }),
        `${what} ${mode === "add" ? "toegevoegd aan" : "verwijderd van"} ${counted(rows.length, "klant", "klanten")}`
      )
    },
    /** Answers the new customer's id, to open the profile. */
    create: async (input: NewCustomer): Promise<string | undefined> => {
      const exit = await write.create({ payload: { ...input, tags: [...input.tags] }, ...keys })
      said(exit, `${input.name} toegevoegd`)
      return Exit.isSuccess(exit) ? exit.value.customers[0]?.id : undefined
    },
    merge: async (keeper: Customer, others: ReadonlyArray<Customer>) =>
      said(
        await write.merge({ payload: { survivorId: keeper.id, ids: others.map((c) => c.id) }, ...keys }),
        `${others.length + 1} profielen samengevoegd tot ${keeper.name}`
      ),
    markNotDuplicate: async (key: string) => {
      const exit = await write.markNotDuplicate({ payload: { key }, ...keys })
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    }
  }
}
