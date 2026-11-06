import type { OrderStatus } from "../lib/types/domain";

/* ─────────────────────────────────────────────────────────────────────
   Order status badge — uses the brand book's signal-{green,amber,red}
   tonal-pair palette only. Terminal states (refunded, cancelled) sit
   on neutral mist; live states use the signal palette to telegraph
   urgency at a glance.

   Sentence case, in the sans, at one radius. It used to be an 11px MONOSPACE
   ALL-CAPS chip with 0.4px of letterspacing — "technical" worn as a costume on
   the word "Paid", repeated down every row of every table in the product.

   `cancelled` moved off ink-4, which is not a text step: 2.60:1 on glacier.
   ───────────────────────────────────────────────────────────────────── */

const MAP: Record<
	OrderStatus | "delayed" | "refund" | "at_supplier",
	{ label: string; bg: string; fg: string }
> = {
	placed: { label: "Geplaatst", bg: "var(--mist)", fg: "var(--ink-3)" },
	paid: {
		label: "Betaald",
		bg: "var(--signal-green-bg)",
		fg: "var(--signal-green)",
	},
	at_supplier: {
		label: "Bij leverancier",
		bg: "var(--signal-amber-bg)",
		fg: "var(--signal-amber)",
	},
	shipped: { label: "Verzonden", bg: "var(--arc-tint)", fg: "var(--arc-ink)" },
	delivered: {
		label: "Bezorgd",
		bg: "var(--signal-green-bg)",
		fg: "var(--signal-green)",
	},
	delayed: {
		label: "Vertraagd",
		bg: "var(--signal-red-bg)",
		fg: "var(--signal-red)",
	},
	refunded: { label: "Terugbetaald", bg: "var(--mist)", fg: "var(--ink-3)" },
	refund: { label: "Terugbetaling", bg: "var(--mist)", fg: "var(--ink-3)" },
	cancelled: { label: "Geannuleerd", bg: "var(--mist)", fg: "var(--ink-3)" },
};

export function OrderStatusBadge({
	status,
}: {
	status: OrderStatus | "delayed" | "refund";
}) {
	const meta = MAP[status] ?? MAP.placed;
	return (
		<span
			className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
			style={{ backgroundColor: meta.bg, color: meta.fg }}
		>
			{meta.label}
		</span>
	);
}
