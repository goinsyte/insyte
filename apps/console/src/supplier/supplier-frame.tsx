import { useAtomMount, useAtomValue } from "@effect/atom-react"
import type { SupplierMe } from "@insyte/modules/supplier-portal/domain/Portal"
import { Frame } from "@insyte/ui/app/shell/frame"
import { Outlet } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo, useRef } from "react"
import { portalOrdersAtom } from "../data/supplier-portal.ts"
import { supplierRealtimeAtom } from "../data/supplier-realtime.ts"
import { ConsoleSupplierPortal, rowOf } from "./portal-source.tsx"
import { SupplierShellSource } from "./shell-source.tsx"

/**
 * The supplier portal's frame (M16 step 2): the design's `Frame` as persona "supplier", over the portal's own source
 * and shell, with the supplier's realtime socket open while it shows. No palette, no Ask Insyte, no Manage: those are
 * the brand's.
 */
export function SupplierFrame({ me }: { me: SupplierMe }) {
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(portalOrdersAtom)))
  const orders = useMemo(() => list?.rows.map(rowOf) ?? [], [list])
  return (
    <ConsoleSupplierPortal me={me}>
      <SupplierShellSource me={me} orders={orders}>
        <Inside />
      </SupplierShellSource>
    </ConsoleSupplierPortal>
  )
}

const nothing = () => {}

function Inside() {
  const main = useRef<HTMLElement>(null)
  useAtomMount(supplierRealtimeAtom)
  return (
    <Frame persona="supplier" main={main} onAskInsyte={nothing} onOpenPalette={nothing} onOpenManage={nothing}>
      <Outlet />
    </Frame>
  )
}
