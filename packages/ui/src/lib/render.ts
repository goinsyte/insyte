import { useRender } from "@base-ui-components/react/use-render"
import type * as React from "react"

/**
 * `asChild`, kept alive on top of Base UI.
 *
 * Radix answered "render my props on the child you were given" with `<Slot>`; Base UI answers it
 * with a `render` prop, which its own components take. `Button` and `Badge` are not Base UI
 * components — they are a `<button>` and a `<span>` with our classes on them — so they need the
 * same answer written out once, rather than forty-six call sites learning a second spelling.
 *
 * `useRender` is Base UI's public hook for exactly this: it merges className strings, composes
 * event handlers and forwards the ref onto whichever element it ends up rendering.
 */
export function useAsChild<T extends Element>(params: {
  asChild: boolean | undefined
  children: React.ReactNode
  props: Record<string, unknown>
  defaultTagName: keyof React.JSX.IntrinsicElements
}): React.ReactElement {
  const { asChild, children, props, defaultTagName } = params
  return useRender<Record<string, never>, T, undefined>(
    asChild === true
      ? { defaultTagName, render: children as React.ReactElement<Record<string, unknown>>, props }
      : { defaultTagName, props: { ...props, children } }
  )
}
