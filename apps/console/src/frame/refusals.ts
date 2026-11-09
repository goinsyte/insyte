import { canRole, isSpecial } from "@insyte/domain/Permissions"
import { useGateRole } from "@insyte/ui/app/access/gate-role"
import { type Level, type Permission, permissionName } from "@insyte/ui/app/lib/permissions"
import type { TeamGate } from "@insyte/ui/app/orders/source"
import { Cause, type Exit } from "effect"
import { toast } from "sonner"

/*
 * How the console says a write did not take (M7): the server's refusal once, in Dutch, from what the record's screen
 * knows about it. A missing permission says which; undo that came too late says so; anything else asks to try again.
 */

/** The typed failure of a write's exit, or the defect squashed: what the server said. */
export const failureOf = <A, E>(exit: Exit.Failure<A, E>): unknown => {
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  return failure === undefined ? Cause.squash(exit.cause) : failure.error
}

/** What any record's undo can answer. */
const UNDO: Record<string, [string, string]> = {
  already_sent: ["Te laat om ongedaan te maken", "De wijziging is al naar Shopify gegaan."],
  expired: ["Te laat om ongedaan te maken", "De wijziging is al naar Shopify gegaan."],
  used: ["Al ongedaan gemaakt", "Deze wijziging is al teruggedraaid."]
}

export interface RefusalCopy {
  /** "Die bestelling bestaat niet meer". */
  readonly gone: string
  readonly conflicts?: Readonly<Record<string, [string, string]>>
  /** A field or a reason code, said as a sentence. */
  readonly invalid?: Readonly<Record<string, string>>
  /** The record's own refusals (refunds, …): `true` when said. */
  readonly other?: (tagged: { readonly _tag?: string; readonly [field: string]: unknown }) => boolean
}

/** The server's refusal, said once. */
export const sayRefusal = (error: unknown, copy: RefusalCopy) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  if (copy.other?.(tagged) === true) return
  switch (tagged._tag) {
    case "Forbidden": {
      const permission = tagged["permission"] as Permission
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${
          permissionName(permission, isSpecial(permission) ? undefined : tagged["level"] as Level)
        }.`
      })
    }
    case "Conflict": {
      const reason = String(tagged["reason"])
      const [title, description] = copy.conflicts?.[reason] ?? UNDO[reason] ??
        (reason === "gone" ? [copy.gone, "Iemand anders was je voor."] : ["Dat lukte niet", "Probeer het zo nog eens."])
      return void toast.error(title, { description })
    }
    case "Invalid": {
      const fields = tagged["fields"] as Record<string, string>
      const said = Object.entries(fields).map(([field, reason]) => copy.invalid?.[field] ?? copy.invalid?.[reason])
        .find(Boolean)
      return void toast.error("Dat kan zo niet", { description: said ?? "Kijk de invoer nog eens na." })
    }
    case "NotFound":
      return void toast.error(copy.gone, { description: "Iemand anders was je voor." })
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

/** Whether the viewer's role may, and if not which permission it misses, as the design's gates say it. */
export function useGate(perm: Permission, arg?: Level): TeamGate {
  const role = useGateRole()
  if (role === null || canRole(role, perm, arg)) return { ok: true, reason: "" }
  return { ok: false, reason: `Je rol ${role.label} mist ${permissionName(perm, arg)}` }
}
