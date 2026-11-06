import { cn } from "../lib/utils";

/*
 * A product's photograph as a small rounded square: in lists, line items and the gallery strip.
 * Without a photograph it is a plain mist square, so a row without one still lines up.
 */
export function ProductThumb({
	src,
	title,
	size = 32,
	className,
}: {
	src: string | undefined;
	title: string;
	/** Edge length in pixels: 28 and 32 in table rows, 40 in line items, 64 in a gallery strip. */
	size?: number;
	className?: string;
}) {
	const cls = cn("shrink-0 bg-mist", size >= 56 ? "rounded-md" : "rounded-sm", className);
	const style = { width: size, height: size };
	return src ? (
		<img src={src} alt={title} loading="lazy" decoding="async" width={size} height={size} className={cn(cls, "object-cover")} style={style} />
	) : (
		<span role="img" aria-label={title} className={cls} style={style} />
	);
}
