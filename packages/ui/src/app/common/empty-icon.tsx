import { motion, useReducedMotion } from "motion/react";

/**
 * The mark an empty state draws, in the console's own hand.
 *
 * Every one of the seven empty states used to be a Lucide glyph dropped into a 48px grey disc —
 * the house style of every admin template there is, and the one place in the product where a
 * screen has nothing to show and therefore nothing but the drawing to be judged on. These are
 * drawn here instead, out of one grammar so the seven read as a set: a dashed slot where the
 * records would be, the record's own glyph inside it, and a single Arc accent.
 *
 * The motion is the slot, not the glyph. A slow march around the dashed edge says "waiting to be
 * filled" without the pulsing or bouncing that would make a quiet screen busy; the glyph breathes
 * two pixels and the Arc dot keeps time with it. `useReducedMotion` stops all three and leaves the
 * drawing exactly as it is — nothing in it depends on being in motion to be legible.
 */

export type EmptyKind =
	| "orders"
	| "customers"
	| "products"
	| "automations"
	| "chargebacks"
	| "tickets"
	| "people"
	| "notifications"
	| "locked"
	| "inbox"
	| "chats"
	| "suppliers"
	| "analytics"
	| "tasks"
	| "calendar"
	| "activity"
	| "returns"
	| "quality"
	| "knowledge"
	| "courses"
	| "sheets"
	| "live";

/* The glyphs, drawn on a 24×24 field so they can be placed by one transform. Strokes only: a
   filled glyph at this size turns into a blot the moment the theme goes dark. */
const GLYPH: Record<EmptyKind, React.ReactNode> = {
	/* A parcel with the arrow that brings it back. */
	returns: (
		<>
			<path d="M7 7.5 13.5 4 20 7.5v7L13.5 18 7 14.5z" />
			<path d="M7 7.5 13.5 11 20 7.5" />
			<path d="M13.5 11v7" />
			<path d="M8 20H3.5" />
			<path d="m5.5 18-2 2 2 2" />
		</>
	),
	/* A tag held under a magnifier: something being looked at before it ships. */
	quality: (
		<>
			<path d="M3 4h8l7 7-7 7-8-8z" />
			<circle cx="7" cy="8" r="1.2" />
			<circle cx="17" cy="17" r="3.5" />
			<path d="m19.5 19.5 2.5 2.5" />
		</>
	),
	/* A mortarboard over a ruled page: something to learn. */
	courses: (
		<>
			<path d="M3 8.5 12 4.5l9 4-9 4z" />
			<path d="M6.5 10.5v4.5c3.5 2.5 7.5 2.5 11 0v-4.5" />
			<path d="M21 8.5v5.5" />
		</>
	),
	/* A ruled sheet, the header row and first column set off. */
	sheets: (
		<>
			<rect x="3.5" y="4.5" width="17" height="15" rx="2" />
			<path d="M3.5 9.5h17" />
			<path d="M3.5 14.5h17" />
			<path d="M9.5 4.5v15" />
		</>
	),
	/* A globe with one meridian and the parallel a visitor is on. */
	live: (
		<>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 3.5c-2.5 2.5-3.5 5.5-3.5 8.5s1 6 3.5 8.5" />
			<path d="M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5" />
			<path d="M3.5 12h17" />
		</>
	),
	/* Two pages of a bound book. */
	knowledge: (
		<>
			<path d="M12 6.5c-2-1.5-5-2-8.5-1.5v13c3.5-.5 6.5 0 8.5 1.5" />
			<path d="M12 6.5c2-1.5 5-2 8.5-1.5v13c-3.5-.5-6.5 0-8.5 1.5z" />
			<path d="M6 9.5h3" />
			<path d="M15 9.5h3" />
			<path d="M15 12.5h3" />
		</>
	),
	orders: (
		<>
			<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
			<path d="M3 7.5 12 12l9-4.5" />
			<path d="M12 12v9" />
		</>
	),
	customers: (
		<>
			<circle cx="9" cy="8" r="3.4" />
			<path d="M3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" />
			<path d="M16 5.2a3.4 3.4 0 0 1 0 6.6" />
			<path d="M18 14.9c1.9.8 3 2.6 3 5.1" />
		</>
	),
	products: (
		<>
			<path d="M4 8.2 12 4l8 4.2-8 4.2z" />
			<path d="M4 8.2v7.6L12 20l8-4.2V8.2" />
			<path d="M12 12.4V20" />
		</>
	),
	automations: (
		<>
			<rect x="3" y="3.5" width="7" height="6" rx="2" />
			<rect x="14" y="14.5" width="7" height="6" rx="2" />
			<path d="M6.5 9.5v4.5a3 3 0 0 0 3 3H14" />
		</>
	),
	chargebacks: (
		<>
			<rect x="3" y="6" width="18" height="12" rx="2.5" />
			<path d="M15.5 12H9" />
			<path d="m11.5 9.5-2.5 2.5 2.5 2.5" />
		</>
	),
	tickets: (
		<>
			<path d="M3.5 5.5h12a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H3.5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z" />
			<path d="M20.5 9.5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2" />
		</>
	),
	people: (
		<>
			<circle cx="10" cy="7.5" r="3.6" />
			<path d="M3.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
			<path d="M19 6.5v5M21.5 9h-5" />
		</>
	),
	notifications: (
		<>
			<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
			<path d="M10 21h4" />
			<path d="M12 3v2" />
		</>
	),
	inbox: (
		<>
			<path d="M3 13.5 5.6 5.8A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13.5" />
			<path d="M3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5h-5.5l-1.5 2.5h-4L8.5 13.5z" />
		</>
	),
	chats: (
		<>
			<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
			<path d="M6.5 9.5h6M6.5 12h3.5" />
			<path d="M20 9v6.5a2 2 0 0 1-2 2h-1v2.5l-3-2.5" />
		</>
	),
	suppliers: (
		<>
			<path d="M2.5 6.5h11v9h-11z" />
			<path d="M13.5 9.5h4l3 3.5v2.5h-7" />
			<circle cx="6.5" cy="17.5" r="1.8" />
			<circle cx="17" cy="17.5" r="1.8" />
		</>
	),
	analytics: (
		<>
			<path d="M3.5 20.5h17" />
			<path d="M6 16.5v-4M10.5 16.5V8M15 16.5v-6M19.5 16.5V5" />
		</>
	),
	tasks: (
		<>
			<rect x="3.5" y="4" width="5" height="5" rx="1.5" />
			<path d="m4.8 15.8 1.4 1.4 2.6-2.8" />
			<path d="M12 6.5h8.5M12 16h8.5" />
		</>
	),
	calendar: (
		<>
			<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
			<path d="M3.5 10h17M8 3v4M16 3v4" />
			<path d="M12 13.5v3h2.5" />
		</>
	),
	activity: (
		<>
			<path d="M2.5 12h4l2.5-6.5 5 13 2.5-6.5h5" />
		</>
	),
	locked: (
		<>
			<rect x="5" y="10.5" width="14" height="10" rx="2" />
			<path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
			<path d="M12 14.5v2.5" />
		</>
	),
};

export function EmptyIcon({
	kind,
	size = 72,
	still: stillProp = false,
}: {
	kind: EmptyKind;
	/** 72 in place of a screen; 48 inside a panel that is one card among several. */
	size?: 72 | 48;
	/** Draw it at rest whatever the reader's setting: the brand book's paused specimens. */
	still?: boolean;
}) {
	const still = useReducedMotion() || stillProp;

	/*
	 * The panel-sized mark drops the slot and keeps the glyph. Scaling the whole scene down took
	 * the glyph to sixteen pixels, where a parcel and a cube are the same grey smudge; the slot is
	 * the part that can be spared, because inside a panel the panel is already the slot.
	 */
	if (size === 48) {
		return (
			<svg
				width="40"
				height="40"
				viewBox="0 0 32 32"
				fill="none"
				role="presentation"
				aria-hidden
			>
				<motion.g
					animate={still ? undefined : { y: [0, -1.5, 0] }}
					transition={{ duration: 3.6, ease: "easeInOut", repeat: Infinity }}
				>
					<g
						transform="translate(2 3)"
						stroke="var(--ink-3)"
						strokeWidth="1.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{GLYPH[kind]}
					</g>
					<motion.circle
						cx="28"
						cy="27"
						r="2.75"
						fill="var(--arc)"
						animate={
							still ? undefined : { scale: [1, 1.16, 1], opacity: [1, 0.72, 1] }
						}
						transition={{ duration: 3.6, ease: "easeInOut", repeat: Infinity }}
						style={{ transformOrigin: "28px 27px" }}
					/>
				</motion.g>
			</svg>
		);
	}

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 72 72"
			fill="none"
			role="presentation"
			aria-hidden
		>
			{/* The slot the records are missing from. */}
			<motion.rect
				x="9"
				y="15"
				width="54"
				height="42"
				rx="11"
				stroke="var(--ink-4)"
				strokeWidth="1.25"
				strokeDasharray="5 5"
				animate={still ? undefined : { strokeDashoffset: [0, -20] }}
				transition={{ duration: 6, ease: "linear", repeat: Infinity }}
			/>
			<motion.g
				animate={still ? undefined : { y: [0, -2, 0] }}
				transition={{
					duration: 3.6,
					ease: "easeInOut",
					repeat: Infinity,
				}}
			>
				<g
					transform="translate(24 24)"
					stroke="var(--ink-3)"
					strokeWidth="1.4"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					{GLYPH[kind]}
				</g>
				{/* The one piece of colour: the record that would be here if there were one. */}
				<motion.circle
					cx="54"
					cy="49"
					r="3.5"
					fill="var(--arc)"
					animate={
						still ? undefined : { scale: [1, 1.16, 1], opacity: [1, 0.72, 1] }
					}
					transition={{
						duration: 3.6,
						ease: "easeInOut",
						repeat: Infinity,
					}}
					style={{ transformOrigin: "54px 49px" }}
				/>
			</motion.g>
		</svg>
	);
}
