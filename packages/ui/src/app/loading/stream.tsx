import { useRouterState } from "@tanstack/react-router";
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../lib/utils";
import type { Persona } from "../lib/types/persona";
import { destinationOf } from "./destination";
import { paceFactor, useArrival, useLoading } from "./pace";
import { COST, skeletonFor } from "./kinds";
import { PageSkeleton } from "./page-skeletons";

/*
 * The three ways something arrives after the frame (ADR-0028).
 *
 * `RouteArrival` — a screen's loader. The first visit to a route draws that route's skeleton until
 *   its data is in; the cache answers every visit after. On the real stack this is the route's
 *   `loader` with `pendingComponent`, and on a server render it never shows at all: the server
 *   waited for the loader and sent the screen.
 * `Stream` — one part of a screen that is allowed to be late: a dashboard card, a record's body.
 *   The frame around it is already there. On the real stack it is a deferred promise under a
 *   Suspense boundary, streamed into the same response.
 * `Stream` around a browser-only part — what only the browser can draw: a chart that measures its box, the
 *   map, the sheet grid. The server sends its skeleton; the browser replaces it after hydration.
 */

/**
 * One part of a screen, late on its first appearance. The fallback is the part's own shape; what
 * arrives settles in over it.
 *
 * `reserve` lays the part out from the start, hidden, with the fallback drawn over the box it takes,
 * so its arrival moves nothing: a masonry board does not repack when its cards fill, and a record
 * opens at the size it will be. The real stack gets the same by giving each boundary's fallback the
 * part's measured size; the reference can simply measure the part.
 */
export function Stream({
	id,
	after = 480,
	fallback,
	children,
	className,
	style,
	reserve = false,
}: {
	id: string;
	/** Its cost, in ms at the live pace. */
	after?: number;
	fallback: ReactNode;
	children: ReactNode;
	className?: string;
	style?: CSSProperties;
	reserve?: boolean;
}) {
	const ready = useArrival(id, after);
	// Only what was waited for settles in; a part that was already in the cache is simply there.
	const waited = useRef(!ready);
	if (reserve) {
		return (
			<div className={cn("relative", className)} style={style}>
				<div className={cn("h-full", ready && waited.current && "stream-in")} style={ready ? undefined : { visibility: "hidden" }} inert={!ready || undefined}>
					{children}
				</div>
				{ready ? null : <div className="absolute inset-0 overflow-hidden">{fallback}</div>}
			</div>
		);
	}
	if (!ready) return <>{fallback}</>;
	return (
		<div className={cn(waited.current && "stream-in", className)} style={style}>
			{children}
		</div>
	);
}

/** The route's key: its route id, or the list's under a record opened over it. */
function useRouteKey(): string {
	return useRouterState({
		select: (s) => {
			const m = s.matches;
			const leaf = m[m.length - (s.location.state.modal === true ? 2 : 1)];
			return (leaf?.routeId ?? "").replace(/\/$/, "") || "/";
		},
	});
}

/**
 * The screen under the shell. Until its first visit has loaded it is that screen's skeleton; when
 * it lands, the work area fades it in once. Waits for the cold start to hand over before it starts.
 */
export function RouteArrival({ persona, main, children }: { persona: Persona; main: RefObject<HTMLElement | null>; children: ReactNode }) {
	const routeId = useRouteKey();
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const booted = useLoading((s) => s.booted);
	const kind = skeletonFor(routeId);
	const ready = useArrival(`route:${routeId}`, COST[kind], { hold: !booted, progress: booted, marks: [`record:${pathname}`] });
	const was = useRef(ready);
	useLayoutEffect(() => {
		// Opacity only: a transform on the scroll container would become the containing block for
		// every fixed panel inside it (the plate, the detail sheet) for as long as it ran.
		if (ready && !was.current) {
			main.current?.animate([{ opacity: 0.001 }, { opacity: 1 }], { duration: 240, easing: "cubic-bezier(0.25, 1, 0.5, 1)" });
		}
		was.current = ready;
	}, [ready, main]);
	if (!ready) return <PageSkeleton kind={kind} title={destinationOf(pathname, persona).label} />;
	return <>{children}</>;
}

/**
 * The navigation line: two pixels of arc across the top of the work column while anything counted
 * toward it is on its way. It runs to most of the width on the expected time and finishes the rest
 * when the thing lands, so a fast load is a flick and a slow one still looks like progress.
 */
export function NavProgress() {
	const busy = useLoading((s) => s.pending > 0);
	const [phase, setPhase] = useState<"idle" | "run" | "done">("idle");
	const [run, setRun] = useState(0);
	useEffect(() => {
		if (busy) {
			setPhase("run");
			setRun((n) => n + 1);
		} else setPhase((p) => (p === "run" ? "done" : p));
	}, [busy]);
	useEffect(() => {
		if (phase !== "done") return;
		const t = window.setTimeout(() => setPhase("idle"), 340);
		return () => window.clearTimeout(t);
	}, [phase]);
	if (phase === "idle") return null;
	return (
		<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-40 h-[2px] overflow-hidden">
			<div
				key={run}
				className={cn("h-full bg-arc", phase === "run" ? "nav-progress" : "opacity-0 transition-opacity duration-300")}
				style={phase === "run" ? ({ "--nav-progress-ms": `${Math.max(500, Math.round(1100 * paceFactor()))}ms` } as CSSProperties) : undefined}
			/>
		</div>
	);
}
