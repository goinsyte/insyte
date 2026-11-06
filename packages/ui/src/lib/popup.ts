/**
 * How every anchored surface in the product enters and leaves.
 *
 * Radix announced open and closed in one attribute and we animated it with keyframes from
 * `tw-animate-css`. Base UI marks the first and last frame instead — `data-starting-style` and
 * `data-ending-style` — which means the motion is an ordinary CSS transition between two states,
 * interruptible, and reversible halfway through. One string, so a menu, a popover, a select and a
 * tooltip cannot drift apart.
 *
 * `--transform-origin` is set by the positioner, so the scale grows out of the trigger rather than
 * out of the middle of the panel; that is what carries the direction, and why there is no per-side
 * slide here.
 */
export const popupMotion = [
  "origin-(--transform-origin)",
  "transition-[opacity,scale,translate] duration-[150ms] ease-out-quart",
  "data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
  "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
  "data-[side=bottom]:data-[starting-style]:-translate-y-1 data-[side=bottom]:data-[ending-style]:-translate-y-1",
  "data-[side=top]:data-[starting-style]:translate-y-1 data-[side=top]:data-[ending-style]:translate-y-1",
  "data-[side=left]:data-[starting-style]:translate-x-1 data-[side=left]:data-[ending-style]:translate-x-1",
  "data-[side=right]:data-[starting-style]:-translate-x-1 data-[side=right]:data-[ending-style]:-translate-x-1"
].join(" ")

/** The same, for a surface that is centred on the viewport and has no side to grow from. */
export const centredPopupMotion = [
  "transition-[opacity,scale] duration-[150ms] ease-out-quart",
  "data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0",
  "data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0"
].join(" ")

/** The dim behind a modal surface. */
export const backdropMotion = [
  "transition-opacity duration-[150ms] ease-out-quart",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0"
].join(" ")
