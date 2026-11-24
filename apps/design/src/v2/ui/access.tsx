import { useState } from "react"
import { AREA_LABEL, level, LEVEL_LABEL, rolesWith, rolLabel, useView } from "../view.ts"
import type { Level, PermArea, Rol } from "../view.ts"
import { Button } from "./button.tsx"
import { cx } from "./cx.ts"
import { Check, Lock } from "./icons.tsx"
import { toast } from "./toast.tsx"

/*
 * What a page or a part of one says when the signed-in role may not see or do what it holds: in
 * place, where the records or the action would be, never over the work. It names the permission that
 * is missing, the role the person has and the roles that do have it, and offers to ask for it. The
 * page around it keeps working. The version 2 form of the current demo's `access/denied.tsx`.
 */

/** What the current role may do in a permission area: read with `useAccess("orders").edit`. */
export function useAccess(area: PermArea) {
  const view = useView()
  const at = level(view, area)
  return { level: at, view: at >= 1, edit: at >= 2, manage: at >= 3, rol: rolLabel(view.rol) }
}

function WhoHasIt({ area, need, as }: { readonly area: PermArea; readonly need: Level; readonly as?: Rol }) {
  const view = useView()
  const mine = rolLabel(as ?? view.rol)
  const others = rolesWith(area, need).filter((r) => r !== mine)
  const joined = others.length <= 1
    ? others.join("")
    : `${others.slice(0, -1).join(", ")} en ${others.at(-1) ?? ""}`
  return (
    <>
      Je rol <span className="font-medium text-ink">{mine}</span> heeft dat niet
      {others.length > 0 ? <>; {joined} {others.length === 1 ? "heeft" : "hebben"} het wel.</> : "."}
    </>
  )
}

/**
 * The refusal itself. `page` fills a page or a pane; `section` replaces one part of a page; `inline`
 * is one line in a sheet or beside a button.
 */
export function Denied({ area, need = 1, what, size = "page", className, as }: {
  readonly area: PermArea
  /** The level the thing needs: 1 to see it, 2 to change it, 3 to manage it. */
  readonly need?: Level
  /** What would be here, as a sentence's object: "de bestellingen", "terugbetalen". */
  readonly what?: string
  readonly size?: "page" | "section" | "inline"
  readonly className?: string
  /** Show it as this role instead of the view's (the kit, a role preview). */
  readonly as?: Rol
}) {
  const [asked, setAsked] = useState(false)
  const permission = `${AREA_LABEL[area]} · ${LEVEL_LABEL[need]}`
  const ask = () => {
    setAsked(true)
    toast({ title: "Toegang gevraagd", body: "Elena Hart krijgt een melding.", tone: "good" })
  }
  const askButton = asked
    ? (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-good-tint px-2.5 text-sm font-medium text-good-ink">
        <Check size={14} />
        Gevraagd
      </span>
    )
    : <Button size={size === "inline" ? "sm" : "md"} onClick={ask}>Toegang vragen</Button>

  if (size === "inline") {
    return (
      <p className={cx("flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-2", className)}>
        <Lock size={14} className="shrink-0 text-ink-3" />
        <span>
          <WhoHasIt area={area} need={need} as={as} />
        </span>
        {askButton}
      </p>
    )
  }

  return (
    <div
      className={cx(
        "flex flex-col items-center gap-3 text-center",
        size === "page" ? "px-6 py-16 sm:py-24" : "rounded-lg bg-well px-5 py-10",
        className
      )}
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-well text-ink-3">
        <Lock size={19} />
      </span>
      <div className="flex max-w-[46ch] flex-col gap-1.5">
        <p className="text-md font-semibold text-ink">
          {what === undefined
            ? "Hier heb je geen toegang toe"
            : `Je kunt ${what} niet ${need >= 2 ? "wijzigen" : "zien"}`}
        </p>
        <p className="text-sm text-pretty text-ink-2">
          Daarvoor is <span className="font-medium text-ink">{permission}</span> nodig.{" "}
          <WhoHasIt area={area} need={need} as={as} />
        </p>
      </div>
      <div className="pt-1">{askButton}</div>
    </div>
  )
}

/** "Alleen lezen": above a page the role may read but not change, with the permission it misses. */
export function ReadOnlyNotice({ area, className, as }: {
  readonly area: PermArea
  readonly className?: string
  readonly as?: Rol
}) {
  const access = useAccess(area)
  const rol = as === undefined ? access.rol : rolLabel(as)
  return (
    <p className={cx("flex items-start gap-2 rounded-md bg-well px-3 py-2.5 text-sm text-ink-2", className)}>
      <Lock size={14} className="mt-0.5 shrink-0 text-ink-3" />
      <span>
        <span className="font-medium text-ink">Alleen lezen.</span> Je rol {rol} heeft geen {AREA_LABEL[area]}{" "}
        · Bewerken, dus je kunt hier kijken maar niets wijzigen.
      </span>
    </p>
  )
}

/** How much one person may refund per order, by role (`/app`'s roles: Klantenservice tot € 100). */
export function refundLimit(rol: Rol): number | null {
  return rol === "klantenservice" ? 100 : null
}
