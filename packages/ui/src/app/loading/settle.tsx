import { createContext } from "react";

/*
 * Arrival (ADR-0028): what replaces a screen's skeleton settles in once, 240ms on `ease-out-quart`, and not at all under
 * reduced motion. Opacity only: a transform on the scroll container would become the containing block for every fixed
 * panel inside it (the plate, the detail sheet) for as long as it ran.
 */

export function settle(main: HTMLElement | null | undefined): void {
	if (!main?.isConnected) return;
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	main.animate([{ opacity: 0.001 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
}

/**
 * Whether a page skeleton settles what replaces it. The reference's `RouteArrival` already does, around every route;
 * the console, whose skeletons are the routes' own pending screens, turns this on in its frames.
 */
export const SettleOnArrival = createContext(false);
