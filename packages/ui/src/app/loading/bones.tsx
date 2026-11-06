import type { CSSProperties, ReactNode } from "react";
import { cn } from "../lib/utils";

/*
 * The parts a skeleton is built from (ADR-0028).
 *
 * A bone stands in for one thing that has not arrived — a line of text at that text's height, a
 * status pill at a pill's size, a figure at the figure's — and nothing else. What the product knows
 * without asking the server (a page's name, a board's columns, a sheet's letters) is drawn as itself,
 * because the real stack renders it on the server with the frame. A skeleton that greys out a title
 * the app has always known is a loading screen pretending to be busier than it is.
 */

/** Widths a run of text lines takes, so a column of them reads as text rather than as bars. */
const RUN = [74, 52, 88, 63, 46, 81, 58, 69, 92, 55, 77, 49] as const;
export const run = (i: number, scale = 1) => `${Math.round(RUN[i % RUN.length]! * scale)}%`;

export function Bone({ className, plate = false, style }: { className?: string; plate?: boolean; style?: CSSProperties }) {
	return <span aria-hidden className={cn("block shrink-0 rounded-[4px]", plate ? "bone-plate" : "bone", className)} style={style} />;
}

/** One line of body text: 14px type, so a 9px bone, centred in the line's 20px. */
export function Line({ w, className, plate }: { w: string | number; className?: string; plate?: boolean }) {
	return (
		<span className={cn("flex h-5 items-center", className)} aria-hidden>
			<Bone plate={plate} className="h-[9px] rounded-full" style={{ width: w }} />
		</span>
	);
}

/** A few lines of a paragraph, the last one short. */
export function Lines({ n = 3, seed = 0, plate, className }: { n?: number; seed?: number; plate?: boolean; className?: string }) {
	return (
		<span className={cn("flex flex-col", className)} aria-hidden>
			{Array.from({ length: n }, (_, i) => (
				<Line key={i} plate={plate} w={i === n - 1 ? run(seed + i, 0.55) : run(seed + i, 1.08)} />
			))}
		</span>
	);
}

export const Pill = ({ w = 64, plate }: { w?: number; plate?: boolean }) => <Bone plate={plate} className="h-5 rounded-md" style={{ width: w }} />;
export const Disc = ({ size = 24, plate }: { size?: number; plate?: boolean }) => (
	<Bone plate={plate} className="rounded-full" style={{ width: size, height: size }} />
);
/** A button or a field: the control's own height, so nothing moves when it arrives. */
export const Control = ({ w = 120, h = 32, plate }: { w?: number; h?: number; plate?: boolean }) => (
	<Bone plate={plate} className="rounded-md" style={{ width: w, height: h }} />
);
/** A figure in the display face: tall and narrow, the height of the number it will be. */
export const Figure = ({ w = 96, h = 22, plate }: { w?: number; h?: number; plate?: boolean }) => (
	<Bone plate={plate} className="rounded-[5px]" style={{ width: w, height: h }} />
);

/**
 * The root every skeleton hangs from: one status for assistive tech ("Laden"), and the bones inside
 * it hidden from it. A screen reader hears that the screen is loading once, not forty empty spans.
 */
export function Arriving({ label = "Laden", className, children }: { label?: string; className?: string; children: ReactNode }) {
	return (
		<div role="status" aria-live="polite" aria-busy="true" className={className}>
			<span className="sr-only">{label}…</span>
			{children}
		</div>
	);
}
