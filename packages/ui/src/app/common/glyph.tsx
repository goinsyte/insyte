import type { IconComponent } from "../../icons";
import { cn } from "../lib/utils";

/**
 * One of Insyte's own icons, alive.
 *
 * The set in `@insyte/ui/icons` measures every stroke as length 1, so any glyph can draw itself in
 * with one dash animation and no knowledge of its geometry: the pen runs over the lines once when
 * the glyph first appears, which is how a drawing board says "this was just put here". After that
 * it is still. Hovering its host — any ancestor marked `glyph-host`, usually the row or card the
 * glyph labels — plays the glyph's own small gesture: a truck drives forward, a bell swings, a
 * rocket lifts, a refresh turns. One gesture each, 420ms, then rest.
 *
 * The tile is optional. Bare, the glyph sits in a line of text; on a tile it is the leading mark of
 * a row, on `mist`, `paper`, `arc-tint` or the plate's dark ground. Reduced motion paints it drawn.
 */

export type GlyphMotion = "none" | "drive" | "swing" | "lift" | "turn" | "pop" | "nudge" | "blink";
export type GlyphTile = "none" | "mist" | "paper" | "tint" | "arc" | "mesh";

const TILE: Record<GlyphTile, string> = {
	none: "",
	mist: "bg-mist text-ink-2",
	paper: "bg-paper text-ink-2",
	tint: "bg-arc-tint text-arc-ink",
	arc: "bg-arc text-mesh-ink",
	mesh: "bg-white/10 text-mesh-ink",
};

export function Glyph({
	icon: Icon,
	motion = "none",
	tile = "none",
	size = 16,
	draw = true,
	delay = 0,
	className,
	label,
}: {
	icon: IconComponent;
	motion?: GlyphMotion;
	tile?: GlyphTile;
	/** The glyph's own size in px; a tile adds 8px round it. */
	size?: number;
	/** Draw the strokes in when first painted. */
	draw?: boolean;
	/** Stagger, in ms, when several glyphs appear together. */
	delay?: number;
	className?: string;
	/** Give the glyph a name when it is the only thing saying what something is. */
	label?: string;
}) {
	const svg = (
		<Icon
			size={size}
			strokeWidth={1.75}
			aria-label={label}
			role={label === undefined ? undefined : "img"}
			className={cn("glyph", draw && "glyph-draw", motion !== "none" && `glyph-${motion}`, tile === "none" && className)}
			style={delay > 0 ? ({ "--glyph-delay": `${delay}ms` } as React.CSSProperties) : undefined}
		/>
	);
	if (tile === "none") return svg;
	return (
		<span
			className={cn("flex shrink-0 items-center justify-center rounded-md", TILE[tile], className)}
			style={{ width: size + 10, height: size + 10 }}
		>
			{svg}
		</span>
	);
}
